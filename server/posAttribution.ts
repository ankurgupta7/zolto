/**
 * POS attribution — "which piece did that amount-only sale actually sell?"
 *
 * At a market stall the fast path is to ring up a bare amount ("CHF 50") and tap,
 * without stopping to pick the product. Those sales land as a `pos_order` with a
 * custom line item that has no productId — so the sale is recorded, but stock was
 * never decremented and the piece was never identified.
 *
 * This end-of-day pass finds those unattributed lines, guesses the most likely
 * in-stock pieces by price (reusing the Stripe reconciliation's `findCandidateProducts`,
 * but per-tenant), records a review row per line, and emails the merchant a one-click
 * confirm link. Nothing touches inventory until the merchant confirms a match — the
 * apply step lives in `posAttributionRoutes.ts`.
 *
 * Distinct from `reconciliation.ts`: that catches Stripe payments with *no local
 * record at all*; this attributes sales the POS already recorded but left as an amount.
 */

import {
  findCandidateProducts,
  generateConfirmationToken,
} from "./reconciliation";
import { createPosAttribution, getUnattributedPosLineItems } from "./db";
import {
  type PosAttributionReviewItem,
  sendPosAttributionReviewEmail,
} from "./_core/email";

export const POS_ATTRIBUTION_LOOKBACK_DAYS_DEFAULT = 3;

export interface PosAttributionSummary {
  /** Unattributed amount-only POS lines found within the lookback window. */
  scannedLines: number;
  /** Lines with at least one candidate product, queued and awaiting confirmation. */
  newPendingReview: number;
  /** Lines with no in-stock product close enough in price to guess. */
  newNoCandidates: number;
  /** Whether the review email was sent (false if nothing needed review, or sending failed). */
  emailSent: boolean;
}

export async function runPosAttribution(
  lookbackDays: number = POS_ATTRIBUTION_LOOKBACK_DAYS_DEFAULT,
): Promise<PosAttributionSummary> {
  const since = new Date(Date.now() - lookbackDays * 86400 * 1000);
  const lines = await getUnattributedPosLineItems(since);

  let newPendingReview = 0;
  let newNoCandidates = 0;
  const reviewItems: PosAttributionReviewItem[] = [];

  for (const line of lines) {
    // Candidates are matched against the line's own tenant catalogue, so this is
    // correct for every store — not just the default tenant.
    const candidates = await findCandidateProducts(
      line.tenantId,
      line.amountRappen,
    );
    const token = generateConfirmationToken();
    const status = candidates.length > 0 ? "pending_review" : "no_candidates";

    await createPosAttribution({
      tenantId: line.tenantId,
      posOrderId: line.posOrderId,
      posOrderItemId: line.posOrderItemId,
      amountRappen: line.amountRappen,
      status,
      candidateProductIds: candidates.map((p) => p.id).join(","),
      confirmationToken: token,
    });

    if (status === "pending_review") {
      newPendingReview++;
      reviewItems.push({
        posOrderItemId: line.posOrderItemId,
        amountRappen: line.amountRappen,
        soldAt: line.createdAt,
        itemLabel: line.name,
        candidates: candidates.map((p) => ({
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
      await sendPosAttributionReviewEmail(reviewItems);
      emailSent = true;
    } catch (err) {
      console.error("[PosAttribution] Failed to send review email:", err);
    }
  }

  return {
    scannedLines: lines.length,
    newPendingReview,
    newNoCandidates,
    emailSent,
  };
}
