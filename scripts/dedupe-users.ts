#!/usr/bin/env tsx
/**
 * scripts/dedupe-users.ts — find, inspect, and remove duplicate user rows.
 *
 * WHY THIS EXISTS
 * `users.email` is not unique; `users.openId` is. Two rows on one address is
 * therefore a state the schema allows on purpose, and usually it is the right
 * one — an owner running two stores has one row per tenant, and an unfinished
 * signup leaves a `pending:<token>` row beside the real account. Neither
 * should be deleted. What should be deleted is the third case: one person who
 * signed in two different ways (`google:<sub>` one day, a magic link the next)
 * and so minted two openIds and two rows on the same tenant.
 *
 * Telling those apart needs the openId, the tenant, and the sign-in dates —
 * not the address — so this prints all of it and lets a human choose. It will
 * not guess, and it deletes only the single id you name.
 *
 * SAFETY
 * Read-only unless --delete is passed with an explicit id. Before deleting it
 * re-reads the row, prints it, and refuses if the row is an unclaimed signup
 * or the last remaining admin of its tenant (that would lock the merchant out
 * of their own store). Deleting a users row is not reversible from here —
 * take a database backup first. Orders and POS history are tenant-scoped and
 * survive; audit_logs.user_id rows are left pointing at a missing user.
 *
 *   Usage, from the repo root on the server (needs DATABASE_URL):
 *     npx tsx scripts/dedupe-users.ts                       # survey: every duplicated address
 *     npx tsx scripts/dedupe-users.ts --email a@b.c         # show the rows behind one address
 *     npx tsx scripts/dedupe-users.ts --delete 42           # remove exactly that row
 *     npx tsx scripts/dedupe-users.ts --delete 42 --force   # skip the safety refusals
 */

import {
  type DuplicateEmailUser,
  deleteUserById,
  findDuplicateEmails,
  getUsersByEmail,
} from "../server/db";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const has = (flag: string) => process.argv.includes(flag);

function describe(u: DuplicateEmailUser): string {
  const store =
    u.tenantId == null
      ? "no tenant"
      : `tenant ${u.tenantId}${u.tenantName ? ` (${u.tenantName})` : ""}`;
  const iso = (d: Date) =>
    new Date(d).toISOString().slice(0, 16).replace("T", " ");
  return [
    `  id ${u.id}  ${u.role.padEnd(10)} ${store}`,
    `      openId       ${u.openId}${u.pendingClaim ? "   ← unclaimed signup, not a duplicate" : ""}`,
    `      name/email   ${u.name ?? "—"} <${u.email ?? "—"}>`,
    `      loginMethod  ${u.loginMethod ?? "—"}`,
    `      created      ${iso(u.createdAt)}      last signed in  ${iso(u.lastSignedIn)}`,
  ].join("\n");
}

/** The rows that genuinely look like one person duplicated, if any. */
function verdict(rows: DuplicateEmailUser[]): string {
  const real = rows.filter((r) => !r.pendingClaim);
  if (real.length < 2) {
    return "Not a duplicate: only one real account here (the rest are unclaimed signups).";
  }
  const tenants = new Set(real.map((r) => r.tenantId));
  if (tenants.size === real.length) {
    return "Probably not a duplicate: one row per tenant — this address runs more than one store.";
  }
  return [
    "Looks like a real duplicate: two rows on the same tenant, different openIds.",
    "Keep the one whose openId matches how they sign in now (usually the more",
    "recent lastSignedIn), and delete the other with --delete <id>.",
  ].join("\n");
}

async function survey() {
  const dupes = await findDuplicateEmails();
  if (dupes.length === 0) {
    console.log("No email address is held by more than one user row.");
    return;
  }
  console.log(`${dupes.length} address(es) held by more than one row:\n`);
  for (const d of dupes) console.log(`  ${d.count}×  ${d.email}`);
  console.log(
    "\nInspect one with:  npx tsx scripts/dedupe-users.ts --email <address>",
  );
}

async function inspect(email: string) {
  const rows = await getUsersByEmail(email);
  if (rows.length === 0) fail(`No user rows with email ${email}`);
  console.log(`${rows.length} row(s) for ${email}:\n`);
  for (const r of rows) console.log(`${describe(r)}\n`);
  console.log(verdict(rows));
}

async function remove(id: number) {
  // Re-read through the address so the siblings are in view: the checks below
  // are all about what the OTHER rows on this tenant look like.
  const all = await findDuplicateEmails();
  let target: DuplicateEmailUser | undefined;
  let siblings: DuplicateEmailUser[] = [];
  for (const { email } of all) {
    const rows = await getUsersByEmail(email);
    const hit = rows.find((r) => r.id === id);
    if (hit) {
      target = hit;
      siblings = rows.filter((r) => r.id !== id);
      break;
    }
  }
  if (!target) {
    fail(
      `User ${id} is not one of a duplicated email address. This script only ` +
        `removes duplicates; use the Staff admin page for ordinary removals.`,
    );
  }

  console.log("About to delete:\n");
  console.log(`${describe(target)}\n`);

  if (!has("--force")) {
    if (target.pendingClaim) {
      fail(
        `User ${id} is an unclaimed signup (openId ${target.openId}), not a ` +
          `duplicate — deleting it abandons a store nobody has claimed yet. ` +
          `Pass --force if you are sure.`,
      );
    }
    const admins = siblings.filter(
      (s) =>
        s.tenantId === target.tenantId &&
        (s.role === "admin" || s.role === "superadmin") &&
        !s.pendingClaim,
    );
    if (
      (target.role === "admin" || target.role === "superadmin") &&
      admins.length === 0
    ) {
      fail(
        `User ${id} is the only admin left on tenant ${target.tenantId} — ` +
          `deleting it locks the merchant out of their own store. Promote ` +
          `another user first, or pass --force.`,
      );
    }
  }

  await deleteUserById(id);
  console.log(`✓ Deleted user ${id}.`);
  console.log(
    "Note: audit_logs.user_id rows for this user now point at a missing user; " +
      "orders and POS history are tenant-scoped and are unaffected.",
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail(
      "DATABASE_URL is not set — run this on the server, from the repo root.",
    );
  }
  const del = arg("--delete");
  if (del !== undefined) {
    const id = Number(del);
    if (!Number.isInteger(id) || id <= 0)
      fail(`--delete needs a user id, got "${del}"`);
    await remove(id);
    return;
  }
  const email = arg("--email");
  if (email !== undefined) {
    await inspect(email);
    return;
  }
  await survey();
}

main()
  .then(() => process.exit(0))
  .catch((err) => fail(err instanceof Error ? err.message : String(err)));
