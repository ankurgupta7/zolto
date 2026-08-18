/**
 * Tier 1 — Stores. Who is on the platform, and pointing the shell at one.
 */

import {
  heading,
  keyValues,
  orDash,
  planLabel,
  shortDate,
  table,
  timestamp,
  yesNo,
} from "../format";
import type { ActionContext } from "../types";
import { confirmWrite, withStore } from "./helpers";

export async function listStores(ctx: ActionContext): Promise<void> {
  const stores = await ctx.platform.platform.tenants();
  ctx.io.printLines(heading(`Stores (${stores.length})`));
  if (stores.length === 0) {
    ctx.io.print("  No stores yet.");
    return;
  }
  ctx.io.printLines(
    table(stores, [
      { label: "id", align: "right", value: (s) => String(s.id) },
      { label: "slug", value: (s) => s.slug },
      { label: "name", value: (s) => s.name },
      { label: "plan", value: (s) => planLabel(s) },
      { label: "status", value: (s) => orDash(s.subscriptionStatus) },
      { label: "stripe", value: (s) => yesNo(s.stripeConnected) },
      { label: "admins", align: "right", value: (s) => String(s.adminCount) },
      { label: "users", align: "right", value: (s) => String(s.userCount) },
      { label: "domain", value: (s) => orDash(s.domain) },
      { label: "created", value: (s) => shortDate(s.createdAt) },
    ]),
  );
  // A store with users but no admin is the single most common support ticket
  // (deploy/tenant-admin.sh explains why), and it is invisible in a list of
  // counts unless something points at it.
  const stranded = stores.filter((s) => s.userCount > 0 && s.adminCount === 0);
  if (stranded.length > 0) {
    ctx.io.print("");
    ctx.io.print(
      `  ⚠ ${stranded.length} store(s) have users but no admin: ${stranded
        .map((s) => s.slug)
        .join(", ")}`,
    );
    ctx.io.print("    Fix under People & access → Set a user's role.");
  }
}

export async function inspectStore(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    const detail = await ctx.platform.platform.tenantDetail({
      tenantId: tenant.id,
    });
    const t = detail.tenant;
    ctx.io.printLines(heading(`${t.name} (${t.slug})`));
    ctx.io.printLines(
      keyValues([
        ["id", String(t.id)],
        ["plan", planLabel(t)],
        ["subscription", orDash(t.subscriptionStatus)],
        ["trial ends", shortDate(t.trialEndsAt)],
        ["comp note", orDash(t.comp?.note)],
        ["comp granted", shortDate(t.comp?.grantedAt ?? null)],
        ["stripe connected", yesNo(t.stripeConnected)],
        ["custom domain", orDash(t.domain)],
        ["onboarding step", orDash(t.onboardingStep)],
        ["referral code", orDash(t.referralCode)],
        ["created", shortDate(t.createdAt)],
      ]),
    );

    ctx.io.printLines(heading(`People (${detail.users.length})`));
    if (detail.users.length === 0) {
      ctx.io.print("  Nobody has signed in to this store yet.");
      return;
    }
    ctx.io.printLines(
      table(detail.users, [
        { label: "id", align: "right", value: (u) => String(u.id) },
        { label: "email", value: (u) => orDash(u.email) },
        { label: "name", value: (u) => orDash(u.name) },
        { label: "role", value: (u) => u.role },
        { label: "sign-in", value: (u) => orDash(u.loginMethod) },
        { label: "pending claim", value: (u) => yesNo(u.pendingClaim) },
        { label: "last seen", value: (u) => timestamp(u.lastSignedIn) },
      ]),
    );
  });
}

/** Point the shell at a store, replacing whatever it was pointed at. */
export async function chooseWorkingStore(ctx: ActionContext): Promise<void> {
  ctx.setStore(null);
  const scope = await ctx.requireStore();
  if (!scope) ctx.io.print("  Still no store selected.");
}

export async function clearWorkingStore(ctx: ActionContext): Promise<void> {
  ctx.setStore(null);
  ctx.io.print("  No store selected. Store-scoped options will ask for one.");
}

/**
 * Create a store from the terminal — the same procedure the signup wizard
 * calls, so the tenant, its settings, its category preset and its POS key are
 * all provisioned exactly as a self-service signup would provision them.
 *
 * The claim token is the point: it, not the email address, is what lets the
 * owner take ownership (tenant.claimAdmin). It is shown once, here.
 */
export async function createStore(ctx: ActionContext): Promise<void> {
  const name = await ctx.io.ask("  Store name (⏎ to cancel)");
  if (name === "") return;
  const suggestedSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  const slug = await ctx.io.ask("  Slug (lowercase, hyphens)", {
    default: suggestedSlug,
  });
  if (slug === "") return;
  const email = await ctx.io.ask("  Owner's email address");
  if (email === "") return;

  if (
    !(await confirmWrite(
      ctx,
      `Create store "${name}" at slug "${slug}", owned by ${email}?`,
    ))
  ) {
    return;
  }

  const created = await ctx.platform.tenant.create({ name, slug, email });
  ctx.io.printLines(heading(`Created ${slug}`));
  ctx.io.printLines(
    keyValues([
      ["tenant id", String(created.tenantId)],
      ["trial ends", shortDate(created.trialEndsAt)],
      ["claim link emailed", yesNo(created.claimEmailSent)],
      ["claim token", created.claimToken],
      ["POS API key", orDash(created.posApiKey)],
    ]),
  );
  ctx.io.print("");
  ctx.io.print(
    "  The claim token and POS key are shown ONCE and are not recoverable.",
  );
  ctx.io.print(
    `  The owner claims the store at /onboarding?store=${slug}&claim=<token>.`,
  );
}
