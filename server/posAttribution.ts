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
import {
  createPosAttribution,
  getTenantAdminContact,
  getTenantById,
  getTenantSettings,
  getUnattributedPosLineItems,
} from "./db";
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

// `tenantId` scopes the run to one store. The merchant-facing Reconciliation
// page passes the caller's own tenant; omitting it sweeps every store and is
// reserved for platform-level use.
export async function runPosAttribution(
  lookbackDays: number = POS_ATTRIBUTION_LOOKBACK_DAYS_DEFAULT,
  tenantId?: number,
): Promise<PosAttributionSummary> {
  const since = new Date(Date.now() - lookbackDays * 86400 * 1000);
  const lines = await getUnattributedPosLineItems(since, tenantId);

  let newPendingReview = 0;
  let newNoCandidates = 0;
  // Grouped per store: the review email goes to each MERCHANT, so a
  // platform-wide sweep must never fold two stores' sales into one message.
  const reviewItemsByTenant = new Map<number, PosAttributionReviewItem[]>();

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
      const tenantItems = reviewItemsByTenant.get(line.tenantId) ?? [];
      reviewItemsByTenant.set(line.tenantId, tenantItems);
      tenantItems.push({
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

  // One review email per store, addressed to that store's own admin with the
  // store's own branding — mirroring runStripeReconciliationForTenant. A
  // failure for one tenant doesn't stop the others' emails going out.
  let emailsSent = 0;
  for (const [tenantId, items] of Array.from(reviewItemsByTenant.entries())) {
    try {
      const [tenant, contact, settings] = await Promise.all([
        getTenantById(tenantId),
        getTenantAdminContact(tenantId),
        getTenantSettings(tenantId),
      ]);
      await sendPosAttributionReviewEmail(items, {
        tenantName: settings?.whiteLabelName ?? tenant?.name,
        tenantDomain:
          settings?.publicDomain ??
          process.env.PUBLIC_BASE_URL ??
          "https://zolto.ch",
        contactEmail: settings?.contactEmail ?? undefined,
        to: contact?.email ?? undefined,
      });
      emailsSent++;
    } catch (err) {
      console.error(
        `[PosAttribution] Failed to send review email for tenant ${tenantId}:`,
        err,
      );
    }
  }

  return {
    scannedLines: lines.length,
    newPendingReview,
    newNoCandidates,
    // True only when every store that needed a review email got one.
    emailSent:
      reviewItemsByTenant.size > 0 && emailsSent === reviewItemsByTenant.size,
  };
}
