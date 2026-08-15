/**
 * Discount codes at the till — the stateful half.
 *
 * `shared/discounts.ts` decides whether a code is usable and what it is worth.
 * This module owns what happens next: claiming a redemption slot, tying that
 * claim to a Stripe session, confirming it when the money actually arrives, and
 * giving it back when it doesn't.
 *
 * The sequence matters, and it is the same shape as the product reservation
 * that surrounds it (server/db.ts reserveProducts):
 *
 *   1. claim  — one atomic UPDATE takes a slot, or fails because there is none
 *   2. hold   — once Stripe hands back a session id, the claim is recorded
 *               against it, with an expiry matching the session's own
 *   3. confirm— the webhook turns the hold into a redemption that happened
 *   4. release— any failure in between, or an expiry with no payment, gives
 *               the slot back
 *
 * Claiming BEFORE the Stripe call is deliberate. The alternative — count
 * redemptions when the webhook lands — leaves a single-use code spendable by
 * two people in the minutes a checkout is open, which for the friends-and-family
 * shape is exactly the failure the limit exists to prevent. The cost is that an
 * abandoned checkout holds a slot until it expires, and step 4 is what bounds
 * that to the session's own lifetime rather than forever.
 */

import {
  evaluateDiscount,
  normaliseDiscountCode,
  type DiscountRefusal,
} from "@shared/discounts";
import {
  DISCOUNT_HOLD_TTL_MS,
  claimDiscountRedemptionSlot,
  confirmDiscountRedemption,
  createDiscountRedemption,
  getDiscountCodeByCode,
  getDiscountRedemptionBySession,
  getExpiredDiscountHolds,
  markDiscountRedemptionReleased,
  releaseDiscountRedemptionSlot,
} from "./db";

/** A slot this checkout owns, and what it is worth. */
export interface ClaimedDiscount {
  codeId: number;
  /** Canonical code, for the Stripe coupon name and the order's metadata. */
  code: string;
  amountOffRappen: number;
}

export type DiscountClaim =
  | { ok: true; discount: ClaimedDiscount }
  | { ok: false; reason: DiscountRefusal | "unknown"; message: string };

/**
 * Validate a code against this basket and take a redemption slot for it.
 *
 * Two checks, not one, and both are needed: `evaluateDiscount` answers "is this
 * code for this basket, today?" from the row we read, and
 * `claimDiscountRedemptionSlot` answers "is there still room?" atomically at
 * the moment of writing. The first can go stale between the read and the write
 * — which is precisely the race two shoppers hitting the last slot of a
 * one-use code produce — so the second is what actually enforces the limit.
 *
 * On success the caller OWNS a slot and must either record a hold for it or
 * release it. There is no third option: an unreleased claim is a redemption
 * nobody ever gets to use.
 */
export async function claimDiscount(params: {
  tenantId: number;
  rawCode: string;
  subtotalRappen: number;
  currency: string;
  now?: Date;
}): Promise<DiscountClaim> {
  const code = normaliseDiscountCode(params.rawCode);
  const unknown = {
    ok: false as const,
    reason: "unknown" as const,
    message: "That discount code isn't valid for this basket.",
  };
  if (!code) return unknown;

  const row = await getDiscountCodeByCode(params.tenantId, code);
  if (!row) return unknown;

  const evaluation = evaluateDiscount({
    terms: row,
    subtotalRappen: params.subtotalRappen,
    currency: params.currency,
    now: params.now,
  });
  if (!evaluation.ok) {
    return {
      ok: false,
      reason: evaluation.reason,
      message: evaluation.message,
    };
  }

  // A code worth nothing on this basket (a percentage that rounds to zero on a
  // tiny order) must not burn a redemption. Nothing would come off the price,
  // and the customer would be told their single-use code was spent.
  if (evaluation.amountOffRappen <= 0) {
    return {
      ok: false,
      reason: "below_minimum",
      message: "That discount code takes nothing off this basket.",
    };
  }

  let claimed = await claimDiscountRedemptionSlot(params.tenantId, row.id);
  if (!claimed) {
    // "Fully redeemed" might only mean "fully held": abandoned checkouts keep
    // their slots until their sessions expire. Give the stale ones back and try
    // once more, so a merchant's last code isn't lost to a shopper who opened
    // Stripe an hour ago and closed the tab.
    const released = await sweepExpiredDiscountHolds({
      tenantId: params.tenantId,
      discountCodeId: row.id,
    });
    if (released > 0) {
      claimed = await claimDiscountRedemptionSlot(params.tenantId, row.id);
    }
  }
  if (!claimed) {
    return {
      ok: false,
      reason: "exhausted",
      message: "That discount code has already been fully redeemed.",
    };
  }

  return {
    ok: true,
    discount: {
      codeId: row.id,
      code: row.code,
      amountOffRappen: evaluation.amountOffRappen,
    },
  };
}

/**
 * Tie a claimed slot to the Stripe session that will spend it. Called once the
 * session exists, because the session id is what the webhook will later present
 * to confirm the redemption.
 */
export async function recordDiscountHold(params: {
  tenantId: number;
  discount: ClaimedDiscount;
  stripeSessionId: string;
  currency: string;
  now?: number;
}): Promise<void> {
  const now = params.now ?? Date.now();
  await createDiscountRedemption({
    tenantId: params.tenantId,
    discountCodeId: params.discount.codeId,
    stripeSessionId: params.stripeSessionId,
    amountOffRappen: params.discount.amountOffRappen,
    currency: params.currency,
    heldUntil: new Date(now + DISCOUNT_HOLD_TTL_MS),
  });
}

/**
 * Give a claimed slot back.
 *
 * Safe to call whether or not a hold row was ever written — a checkout can fail
 * on either side of that line. The three cases, and why they differ:
 *
 * - no hold row at all: the claim was taken but never recorded, so the counter
 *   is the only thing to undo. Decrement.
 * - a row we just moved out of `held`: this call owns the release. Decrement.
 * - a row that was already confirmed or released: somebody else has accounted
 *   for it. Leave the counter alone — decrementing here is how a promotion
 *   quietly gives out more discounts than the merchant authorised.
 */
export async function releaseDiscountClaim(params: {
  tenantId: number;
  codeId: number;
  stripeSessionId?: string;
}): Promise<void> {
  try {
    if (params.stripeSessionId) {
      const moved = await markDiscountRedemptionReleased(
        params.stripeSessionId,
      );
      if (!moved) {
        const existing = await getDiscountRedemptionBySession(
          params.stripeSessionId,
        );
        if (existing) return; // already confirmed or already released
      }
    }
    await releaseDiscountRedemptionSlot(params.tenantId, params.codeId);
  } catch (err) {
    // The caller is already on a failure path (a Stripe error, a DB write that
    // didn't land). Throwing here would replace the error the merchant needs to
    // see with one about bookkeeping.
    console.warn(
      `[Discounts] Could not release the claim on code ${params.codeId}:`,
      err,
    );
  }
}

/**
 * Turn this session's hold into a redemption that happened. Idempotent by way
 * of the `held` guard in the UPDATE, so Stripe's webhook retries — and the
 * admin's manual "re-run fulfillment" button — confirm once and no more.
 *
 * Never throws: a discount bookkeeping failure must not take down order
 * fulfillment, which has already been paid for.
 */
export async function confirmDiscountForSession(
  stripeSessionId: string,
  details: { orderId?: number | null; customerEmail?: string | null } = {},
): Promise<void> {
  try {
    await confirmDiscountRedemption(stripeSessionId, details);
  } catch (err) {
    console.error(
      `[Discounts] Failed to confirm the redemption for session ${stripeSessionId}. ` +
        `The order is unaffected; the code's redeemed count may now be one high.`,
      err,
    );
  }
}

/**
 * Release the slots behind checkouts that were opened and never paid for.
 *
 * Without this a limited promotion leaks: every abandoned basket keeps its
 * slot, and a fifty-code campaign quietly runs out after thirty sales.
 *
 * Deliberately NOT a cron job. It runs at the two moments its result is about
 * to be read — when a shopper's claim is refused as exhausted (below), and when
 * a merchant opens the discounts page — so the counter self-heals exactly where
 * a stale number would otherwise be believed, on any deployment, with no
 * scheduler configured. Bounded per run so a long-neglected instance recovers
 * over several passes rather than in one enormous transaction.
 *
 * Returns how many slots were given back.
 */
export async function sweepExpiredDiscountHolds(
  scope: { tenantId?: number; discountCodeId?: number; limit?: number } = {},
): Promise<number> {
  const expired = await getExpiredDiscountHolds(scope);
  let released = 0;
  for (const hold of expired) {
    try {
      // Mark first, decrement only if THIS pass is the one that moved the row.
      // A hold confirmed by a webhook a moment ago must not also be released:
      // that would return a slot the customer actually spent, and the next
      // sweep would do it again.
      //
      // The ordering is deliberate too. If the process dies between the two
      // statements the count stays one HIGH — a promotion that gives out one
      // fewer discount than intended, which a merchant can fix by raising the
      // limit. The reverse order fails the other way, repeatedly.
      const moved = await markDiscountRedemptionReleased(hold.stripeSessionId);
      if (!moved) continue;
      await releaseDiscountRedemptionSlot(hold.tenantId, hold.discountCodeId);
      released++;
    } catch (err) {
      console.warn(
        `[Discounts] Could not release the expired hold on session ${hold.stripeSessionId}:`,
        err,
      );
    }
  }
  return released;
}

/** What a paid order's discount was, for the receipt and the admin's order list. */
export async function discountForSession(stripeSessionId: string) {
  return getDiscountRedemptionBySession(stripeSessionId);
}
