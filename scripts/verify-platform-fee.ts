#!/usr/bin/env tsx
/**
 * scripts/verify-platform-fee.ts — prove Zolto's platform fee actually works.
 *
 * WHY THIS EXISTS
 * The 1% fee on online + agent orders is the entire Free-plan business model,
 * and until this script runs green it has never been accepted or settled by
 * real Stripe. Every unit test around it passes and always has; they exercise
 * our arithmetic and our parameter shape, neither of which is the open
 * question. The open question is whether a real connected Standard account
 * lets the platform take `application_fee_amount` on a direct charge.
 *
 * It matters that this is checked deliberately, because the failure is quiet.
 * If Stripe rejects the fee, createStorefrontCheckoutSession retries WITHOUT
 * it so the vendor's sale still completes (that fallback is intentional — an
 * unmonetised sale beats a lost one). The visible result is a working
 * storefront that earns Zolto nothing. Nobody would notice from the outside.
 *
 * WHAT IT DOES
 * Creates and confirms a real test-mode PaymentIntent on the tenant's own
 * connected account, then reads back the application fee from the PLATFORM
 * account to confirm the money arrived. Runs the Free case (fee expected) and
 * the Pro case (no fee expected), refunds both, and exits non-zero on any
 * disagreement. Fee amounts come from platformFeeRappen() — the same function
 * checkout calls — so this cannot pass while production would fail.
 *
 * SAFETY
 * Test-mode keys only. It refuses to run against sk_live_ (it would create a
 * genuine charge on a real merchant's account) and it refunds everything it
 * creates.
 *
 *   Usage, from the repo root on the server:
 *     npx tsx scripts/verify-platform-fee.ts
 *     npx tsx scripts/verify-platform-fee.ts --list               # what exists
 *     npx tsx scripts/verify-platform-fee.ts --account acct_123   # pick one
 *     npx tsx scripts/verify-platform-fee.ts --keep               # no refunds
 *
 * Start with --list when a connection seems not to have worked. A live-mode
 * connection never shows up under a test-mode key, so an empty list is the
 * clearest evidence that onboarding ran in the wrong mode.
 */

// Reads the repo-root .env into process.env. dotenv parses KEY=VALUE
// literally, so a value like RESEND_FROM_EMAIL=Zolto <orders@zolto.ch> is
// safe — unlike `set -a; . ./.env`, which would treat the `<` as a redirect.
// Anything already in the real environment still wins.
import "dotenv/config";
import Stripe from "stripe";
import { platformFeeRappen, isPlatformFeeRejection } from "../server/checkoutSession";
import {
  chf,
  summarise,
  verdictFor,
  type FeeObservation,
  type FeeVerdict,
} from "../server/platformFeeVerify";

// ── Arguments ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const KEEP = argv.includes("--keep");
const LIST = argv.includes("--list");
const ACCOUNT_ARG = (() => {
  const i = argv.indexOf("--account");
  return i >= 0 ? argv[i + 1] : undefined;
})();

/** The order we pretend to sell: CHF 100.00, so a 1% fee is a clean CHF 1.00. */
const SUBTOTAL_RAPPEN = 10_000;
const CURRENCY = "chf";

function line(s = "") {
  console.log(s);
}
function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

// ── Preflight ────────────────────────────────────────────────────────────────
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  fail(
    "STRIPE_SECRET_KEY is not set, and it was not found in ./.env either.\n" +
      "Run this from the repo root on the server, where .env lives.",
  );
}
if (KEY.startsWith("sk_live_")) {
  fail(
    "STRIPE_SECRET_KEY is a LIVE key. This script confirms a real payment and " +
      "would charge a real card on a real merchant's account. Point it at a " +
      "test key (sk_test_...) instead.",
  );
}
if (!KEY.startsWith("sk_test_")) {
  fail(`STRIPE_SECRET_KEY does not look like a Stripe secret key.`);
}

const stripe = new Stripe(KEY);

line("═".repeat(66));
line(" Zolto platform fee — end-to-end verification against real Stripe");
line("═".repeat(66));

/**
 * Distinguish "the network cannot reach Stripe" from "Stripe rejected the
 * fee". The Stripe SDK reports a blocked connection as "Invalid JSON received
 * from the Stripe API", which reads exactly like a malformed request and has
 * already cost this project several rounds of misdiagnosis.
 */
async function assertStripeReachable(): Promise<void> {
  try {
    await stripe.balance.retrieve();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid json|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|socket hang up|403/i.test(msg)) {
      fail(
        `cannot reach api.stripe.com — ${msg}\n\n` +
          "This is a network problem, NOT a fee problem: nothing below would be " +
          "meaningful. If you are behind an egress proxy, allow api.stripe.com " +
          "and re-run. Do not read this as the fee being rejected.",
      );
    }
    fail(`Stripe rejected the platform key itself: ${msg}`);
  }
}

/** Find a connected account to test against. */
async function resolveAccount(): Promise<string> {
  if (ACCOUNT_ARG) return ACCOUNT_ARG;
  const accounts = await stripe.accounts.list({ limit: 10 });
  const usable = accounts.data.find((a) => a.charges_enabled);
  if (!usable) {
    fail(
      "no connected account with charges enabled was found on this platform.\n" +
        "Connect a test merchant first (sign up a store, then 'Connect Stripe' " +
        "in its admin), or pass one explicitly with --account acct_...",
    );
  }
  return usable.id;
}

/**
 * Run one case end to end: create a direct charge on the connected account
 * carrying `feeRappen`, confirm it, and read back what the platform actually
 * received. Returns what we observed, never what we hoped.
 */
async function runCase(
  label: string,
  account: string,
  feeRappen: number,
): Promise<{ observation: FeeObservation; paymentIntentId?: string }> {
  line(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  line(`  subtotal            ${chf(SUBTOTAL_RAPPEN)}`);
  line(`  fee our code wants  ${chf(feeRappen)}`);

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: SUBTOTAL_RAPPEN,
        currency: CURRENCY,
        // A shared test payment method; no redirect, so this confirms inline.
        payment_method: "pm_card_visa",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        confirm: true,
        description: `Zolto platform fee verification (${label})`,
        // Omitted entirely when zero — exactly as checkoutSession.ts does it.
        ...(feeRappen > 0 ? { application_fee_amount: feeRappen } : {}),
      },
      // The direct charge: runs on the tenant's own account using Zolto's
      // platform key. This is the line the whole model depends on.
      { stripeAccount: account },
    );
  } catch (err) {
    const recognised = isPlatformFeeRejection(err);
    line(`  Stripe REFUSED the charge.`);
    line(`    error:            ${err instanceof Error ? err.message : String(err)}`);
    line(`    recognised as a fee rejection by our classifier: ${recognised}`);
    return {
      observation: {
        expectedFeeRappen: feeRappen,
        observedFeeRappen: null,
        rejected: true,
        rejectionRecognised: recognised,
      },
    };
  }

  line(`  payment intent      ${intent.id} (${intent.status})`);

  if (intent.status !== "succeeded") {
    line(`  charge did not settle — cannot observe a fee.`);
    return {
      observation: { expectedFeeRappen: feeRappen, observedFeeRappen: null },
      paymentIntentId: intent.id,
    };
  }

  // Read the fee from the PLATFORM account. Asking the connected account what
  // it was charged would only echo the request; this confirms Zolto received
  // it, which is the actual claim being tested.
  const charge = await stripe.charges.retrieve(
    typeof intent.latest_charge === "string"
      ? intent.latest_charge
      : (intent.latest_charge?.id ?? ""),
    {},
    { stripeAccount: account },
  );

  let observedFeeRappen: number | null = null;
  if (charge.application_fee) {
    const feeId =
      typeof charge.application_fee === "string"
        ? charge.application_fee
        : charge.application_fee.id;
    const appFee = await stripe.applicationFees.retrieve(feeId);
    observedFeeRappen = appFee.amount;
    line(`  application fee     ${feeId}`);
    line(`  landed on platform  ${chf(appFee.amount)} (${appFee.currency})`);
  } else {
    line(`  application fee     none recorded on the charge`);
  }

  return {
    observation: { expectedFeeRappen: feeRappen, observedFeeRappen },
    paymentIntentId: intent.id,
  };
}

async function refund(account: string, paymentIntentId: string) {
  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntentId, refund_application_fee: true },
      { stripeAccount: account },
    );
    line(`  refunded ${paymentIntentId}`);
  } catch (err) {
    line(
      `  WARNING: could not refund ${paymentIntentId} — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Show every connected account and whether it can actually take a charge.
 *
 * Exists because "the fee is broken" and "I have no usable connected account"
 * look identical from the outside, and the Connect onboarding form gives no
 * hint about which mode it is running in. charges_enabled is the only thing
 * that decides whether the verification below can say anything at all.
 */
async function listAccounts(): Promise<void> {
  const accounts = await stripe.accounts.list({ limit: 25 });
  line(`\nPlatform key:       ${KEY!.slice(0, 12)}… (TEST mode)`);
  line(`Connected accounts: ${accounts.data.length}\n`);
  if (accounts.data.length === 0) {
    line("  none — nothing has completed the Connect flow against this key.");
    line("  If you just went through onboarding and expected one here, the");
    line("  flow probably ran against your LIVE client id: a live-mode");
    line("  connection never appears under a test-mode key.");
    return;
  }
  for (const a of accounts.data) {
    const usable = a.charges_enabled ? "USABLE" : "not usable";
    line(`  ${a.id}  ${usable}`);
    line(`      charges_enabled=${a.charges_enabled}  details_submitted=${a.details_submitted}`);
    line(`      country=${a.country}  type=${a.type}`);
    const due = a.requirements?.currently_due ?? [];
    if (due.length) line(`      still required: ${due.join(", ")}`);
  }
  line("");
  line("Any account marked USABLE can run the check now:");
  line("  pnpm verify:fee --account <acct_...>");
}

async function main() {
  await assertStripeReachable();

  if (LIST) {
    await listAccounts();
    process.exit(0);
  }

  const account = await resolveAccount();

  const acct = await stripe.accounts.retrieve(account);
  line(`\nPlatform key:       ${KEY!.slice(0, 12)}… (test mode)`);
  line(`Connected account:  ${account}`);
  line(`  charges enabled:  ${acct.charges_enabled}`);
  line(`  country / type:   ${acct.country} / ${acct.type}`);

  if (!acct.charges_enabled) {
    fail(
      `connected account ${account} cannot accept charges yet — finish its ` +
        `Stripe onboarding first. Nothing below would be meaningful.`,
    );
  }

  const created: string[] = [];
  const results: { label: string; verdict: FeeVerdict }[] = [];

  for (const plan of ["free", "pro"] as const) {
    // The expectation comes from production's own function, so this script
    // cannot pass while checkout would fail.
    const feeRappen = platformFeeRappen(plan, SUBTOTAL_RAPPEN);
    const { observation, paymentIntentId } = await runCase(
      `${plan.toUpperCase()} plan — expect ${chf(feeRappen)}`,
      account,
      feeRappen,
    );
    if (paymentIntentId) created.push(paymentIntentId);

    const verdict = verdictFor(observation);
    line(`  ${verdict.pass ? "PASS" : "FAIL"}: ${verdict.message}`);
    results.push({ label: plan, verdict });
  }

  if (created.length && !KEEP) {
    line(`\n── Cleanup ${"─".repeat(54)}`);
    for (const id of created) await refund(account, id);
  } else if (KEEP) {
    line(`\n(--keep: leaving ${created.length} test charge(s) in place)`);
  }

  const { pass, failed } = summarise(results);
  line(`\n${"═".repeat(66)}`);
  if (pass) {
    line(" ✅ The platform fee works end to end against real Stripe.");
    line("    Free-plan orders are charged; Pro-plan orders are not; the money");
    line("    lands on the platform account. This was the launch blocker.");
  } else {
    line(` ❌ FAILED: ${failed.join(", ")}`);
    line("    Read the case above — the message says which of the two failure");
    line("    modes this is and what to change. Do NOT launch the Free plan on");
    line("    the assumption that the fee is collected.");
  }
  line("═".repeat(66));
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error("\nUnexpected failure:", err);
  process.exit(1);
});
