#!/usr/bin/env tsx
/**
 * scripts/stripe-cleanup.ts — clear out connected accounts left over from testing.
 *
 * WHAT IT WILL NEVER TOUCH
 * Your own Stripe account. Its brand, bank details, business profile, API keys
 * and Connect settings are not reachable from here: `accounts.list` returns
 * CONNECTED accounts only — other businesses linked to yours — and your own
 * account is a different endpoint this script never calls. Nothing below can
 * alter your payout details.
 *
 * DELETE VS DISCONNECT
 * A Standard connected account belongs to the MERCHANT, not to you. They signed
 * up with Stripe themselves; you only hold an authorisation to act for them.
 * There is no "delete" that is yours to perform, so for those the script
 * deauthorizes — severing the link and leaving their business untouched. It
 * deletes only accounts the platform owns (Custom/Express) and test-mode
 * accounts, which are disposable by design.
 *
 * SAFETY
 * Dry run unless --delete is passed, so the default outcome of a mistyped
 * command is a printed plan. A live key additionally requires --live-confirm;
 * without it every live account is skipped and listed, not acted on.
 *
 *   Usage, from the repo root:
 *     npx tsx scripts/stripe-cleanup.ts                  # dry run (default)
 *     npx tsx scripts/stripe-cleanup.ts --delete         # act (test mode)
 *     npx tsx scripts/stripe-cleanup.ts --delete --live-confirm
 *
 * Deleting a connected account leaves Zolto's own database pointing at
 * something that no longer exists, so this also reports which tenants
 * referenced it. Pass --clear-db to null those columns out in the same run.
 */

import "dotenv/config";
import Stripe from "stripe";
import { actionFor, describePlan, type CleanupAccount } from "../server/stripeCleanup";

const argv = process.argv.slice(2);
const DO_IT = argv.includes("--delete");
const LIVE_CONFIRM = argv.includes("--live-confirm");
const CLEAR_DB = argv.includes("--clear-db");

function line(s = "") {
  console.log(s);
}
function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) fail("STRIPE_SECRET_KEY is not set, and ./.env has none either.");
if (!KEY.startsWith("sk_test_") && !KEY.startsWith("sk_live_")) {
  fail("STRIPE_SECRET_KEY does not look like a Stripe secret key.");
}

const LIVE = KEY.startsWith("sk_live_");
const stripe = new Stripe(KEY);

async function main() {
  line("═".repeat(70));
  line(" Stripe connected-account cleanup");
  line("═".repeat(70));
  line(`Key:   ${KEY!.slice(0, 12)}…  (${LIVE ? "LIVE" : "TEST"} mode)`);
  line(`Mode:  ${DO_IT ? "WILL MAKE CHANGES" : "dry run — nothing will change"}`);
  line("");
  line("Your own account is never touched: this reads accounts.list, which");
  line("returns connected accounts only. Brand and bank details are safe.");

  // Connected accounts only. Deliberately paginated so a long list cannot be
  // silently truncated into a plan that looks complete but isn't.
  const accounts: Stripe.Account[] = [];
  for await (const a of stripe.accounts.list({ limit: 100 })) {
    accounts.push(a);
  }

  if (accounts.length === 0) {
    line("\nNo connected accounts. Nothing to do.");
    return;
  }

  const opts = { live: LIVE, liveConfirmed: LIVE_CONFIRM };
  const entries = accounts.map((a) => {
    const account: CleanupAccount = {
      id: a.id,
      type: a.type,
      chargesEnabled: a.charges_enabled,
      detailsSubmitted: a.details_submitted,
      livemode: LIVE,
    };
    return { account, action: actionFor(account, opts) };
  });

  const plan = describePlan(entries);
  line(`\n── Plan for ${accounts.length} connected account(s) ${"─".repeat(24)}`);
  for (const l of plan.lines) line(l);
  line("");
  line(
    `  delete: ${plan.deletes}   deauthorize: ${plan.deauthorizes}   skip: ${plan.skips}`,
  );

  if (LIVE && !LIVE_CONFIRM) {
    line("");
    line("These are LIVE accounts and --live-confirm was not passed, so every");
    line("one was skipped. Re-run with --delete --live-confirm only if you are");
    line("certain no real merchant depends on these connections.");
    return;
  }

  if (!DO_IT) {
    line("");
    line("Dry run. Re-run with --delete to carry out the plan above.");
    return;
  }

  line(`\n── Executing ${"─".repeat(46)}`);
  const goneIds: string[] = [];
  for (const { account, action } of entries) {
    try {
      if (action.kind === "delete") {
        await stripe.accounts.del(account.id);
        goneIds.push(account.id);
        line(`  deleted      ${account.id}`);
      } else if (action.kind === "deauthorize") {
        const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
        if (!clientId) {
          line(`  SKIPPED      ${account.id} — STRIPE_CONNECT_CLIENT_ID unset`);
          continue;
        }
        await stripe.oauth.deauthorize({
          client_id: clientId,
          stripe_user_id: account.id,
        });
        goneIds.push(account.id);
        line(`  disconnected ${account.id} (their account still exists)`);
      } else {
        line(`  skipped      ${account.id}`);
      }
    } catch (err) {
      // Keep going: one stubborn account must not strand the rest half-done.
      line(
        `  FAILED       ${account.id} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  await reconcileDatabase(goneIds);

  line("");
  line("Done. Re-check with: pnpm verify:fee --list");
}

/**
 * Zolto stores the connected account id on each tenant. Once the account is
 * gone, that column points at nothing and checkout fails with account_invalid
 * — which now surfaces as "reconnect Stripe" (see isConnectionRevoked), but is
 * still better avoided than explained.
 */
async function reconcileDatabase(goneIds: string[]) {
  if (goneIds.length === 0) return;
  let db: typeof import("../server/db");
  try {
    db = await import("../server/db");
  } catch {
    line("\n(could not load the database layer — skipping tenant reconciliation)");
    return;
  }

  const stale: { id: number; slug: string; acct: string }[] = [];
  try {
    for (const acct of goneIds) {
      const tenant = await db.getTenantByStripeAccountId?.(acct);
      if (tenant) stale.push({ id: tenant.id, slug: tenant.slug, acct });
    }
  } catch (err) {
    line(
      `\n(could not check tenants — ${err instanceof Error ? err.message : err})`,
    );
    return;
  }

  if (stale.length === 0) return;

  line(`\n── Tenants still pointing at a removed account ${"─".repeat(21)}`);
  for (const t of stale) {
    line(`  tenant ${t.id} (${t.slug}) → ${t.acct}`);
  }
  if (!CLEAR_DB) {
    line("");
    line("Re-run with --clear-db to null these out, or reconnect each store.");
    return;
  }
  for (const t of stale) {
    await db.clearTenantStripeConnectAccount(t.id);
    line(`  cleared tenant ${t.id} (${t.slug})`);
  }
}

main().catch((err) => {
  console.error("\nUnexpected failure:", err);
  process.exit(1);
});
