/**
 * Stripe payment reconciliation
 *
 * Compares payments Stripe says succeeded against our own records (`orders`
 * for web checkout, `pos_orders` for the in-person card terminal). Any Stripe
 * payment with no local counterpart gets a best-guess shortlist of in-stock
 * products (ranked by how close their price is to the amount charged) and is
 * recorded in `stripe_reconciliations`. The admin is emailed the shortlist
 * and picks a match (or "none of these") via a one-click link — see
 * `reconciliationRoutes.ts`. Inventory is only touched once the admin
 * confirms a match; this job never mutates stock itself.
 */

import crypto from "node:crypto";
import type Stripe from "stripe";
import {
  createStripeReconciliation,
  getAvailableProductsForMatching,
  getKnownOrderPaymentIntentIds,
  getKnownPosPaymentIntentIds,
  getKnownReconciliationPaymentIntentIds,
} from "./db";
import {
  type ReconciliationReviewItem,
  sendReconciliationReviewEmail,
} from "./_core/email";
import { getStripe } from "./stripe";
import type { Product } from "../drizzle/schema";

export const RECONCILIATION_LOOKBACK_DAYS_DEFAULT = 30;
export const MAX_CANDIDATES = 3;
// Safety cap so a manual run can't run away scanning years of history.
const MAX_PAYMENT_INTENTS_SCANNED = 500;

export function generateConfirmationToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Ranks in-stock products by how close their price is to the amount charged
 * (closest first, ties broken by newest listing first) and returns the top
 * candidates.
 */
export async function findCandidateProducts(
  amountRappen: number
): Promise<Product[]> {
  const available = await getAvailableProductsForMatching();
  const priceDiff = (p: Product) =>
    Math.abs(Math.round(Number(p.price) * 100) - amountRappen);

  return [...available]
    .sort((a, b) => {
      const diff = priceDiff(a) - priceDiff(b);
      if (diff !== 0) return diff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, MAX_CANDIDATES);
}

export interface ReconciliationSummary {
  /** Successful Stripe payments found within the lookback window. */
  scannedSucceededPayments: number;
  /** Of those, how many already exist in `orders`, `pos_orders`, or a prior run. */
  alreadyRecorded: number;
  /** Newly detected payments with at least one candidate product, awaiting admin review. */
  newPendingReview: number;
  /** Newly detected payments with no in-stock product close enough to guess. */
  newNoCandidates: number;
  /** Whether the admin review email was sent (false if nothing new needed review, or sending failed). */
  emailSent: boolean;
}

export async function runStripeReconciliation(
  lookbackDays: number = RECONCILIATION_LOOKBACK_DAYS_DEFAULT
): Promise<ReconciliationSummary> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const sinceUnix = Math.floor(Date.now() / 1000) - lookbackDays * 86400;

  const [orderIds, posIds, reconciledIds] = await Promise.all([
    getKnownOrderPaymentIntentIds(),
    getKnownPosPaymentIntentIds(),
    getKnownReconciliationPaymentIntentIds(),
  ]);
  const known = new Set<string>([
    ...Array.from(orderIds),
    ...Array.from(posIds),
    ...Array.from(reconciledIds),
  ]);

  let scannedSucceededPayments = 0;
  let alreadyRecorded = 0;
  const unmatched: Stripe.PaymentIntent[] = [];

  const list = stripe.paymentIntents.list({
    created: { gte: sinceUnix },
    limit: 100,
  });

  let iterated = 0;
  for await (const intent of list) {
    iterated++;
    if (iterated > MAX_PAYMENT_INTENTS_SCANNED) break;
    if (intent.status !== "succeeded") continue;

    scannedSucceededPayments++;
    if (known.has(intent.id)) {
      alreadyRecorded++;
      continue;
    }
    unmatched.push(intent);
  }

  let newPendingReview = 0;
  let newNoCandidates = 0;
  const reviewItems: ReconciliationReviewItem[] = [];

  for (const intent of unmatched) {
    const candidates = await findCandidateProducts(intent.amount);
    const token = generateConfirmationToken();
    const status = candidates.length > 0 ? "pending_review" : "no_candidates";
    const paymentMethodType = Array.isArray(intent.payment_method_types)
      ? (intent.payment_method_types[0] ?? null)
      : null;

    await createStripeReconciliation({
      stripePaymentIntentId: intent.id,
      amountRappen: intent.amount,
      currency: intent.currency,
      stripeCreatedAt: new Date(intent.created * 1000),
      description: intent.description ?? null,
      paymentMethodType,
      status,
      candidateProductIds: candidates.map(p => p.id).join(","),
      confirmationToken: token,
    });

    if (status === "pending_review") {
      newPendingReview++;
      reviewItems.push({
        paymentIntentId: intent.id,
        amountRappen: intent.amount,
        currency: intent.currency,
        stripeCreatedAt: new Date(intent.created * 1000),
        candidates: candidates.map(p => ({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn ?? null,
          price: p.price,
        })),
        token,
      });
    } else {
      newNoCandidates++;
    }
  }

  let emailSent = false;
  if (reviewItems.length > 0) {
    try {
      await sendReconciliationReviewEmail(reviewItems);
      emailSent = true;
    } catch (err) {
      console.error("[Reconciliation] Failed to send review email:", err);
    }
  }

  return {
    scannedSucceededPayments,
    alreadyRecorded,
    newPendingReview,
    newNoCandidates,
    emailSent,
  };
}
