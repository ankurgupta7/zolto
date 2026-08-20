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

import { BRAND } from "@shared/brand";
import {
  findCandidateProducts,
  generateConfirmationToken,
} from "./reconciliation";
import {
  createPosAttribution,
  extendReviewTokenExpiry,
  getPendingPosAttributions,
  getTenantAdminContact,
  getTenantById,
  getTenantSettings,
  getUnattributedPosLineItems,
} from "./db";
import {
  buildPosAttributionReviewHtml,
  type PosAttributionReviewItem,
  sendPosAttributionReviewEmail,
} from "./_core/email";
import { MAX_REVIEW_ITEMS, toBaseUrl } from "./reconciliation";
import { resolveStoredCandidates } from "./pendingReview";
import { reviewTokenExpiry } from "./reviewToken";

export const POS_ATTRIBUTION_LOOKBACK_DAYS_DEFAULT = 3;

export interface PosAttributionSummary {
  /** Unattributed amount-only POS lines found within the lookback window. */
  scannedLines: number;
  /** Lines with at least one candidate product, queued and awaiting confirmation. */
  newPendingReview: number;
  /** Lines with no in-stock product close enough in price to guess. */
  newNoCandidates: number;
  /**
   * Lines queued by an EARLIER run that are still unconfirmed, and so are
   * included in this run's review again. Re-running is deliberately not a
   * no-op: the first run's email may never have arrived.
   */
  stillPendingReview: number;
  /** Everything in this run's review — `newPendingReview` + `stillPendingReview`. */
  totalPendingReview: number;
  /** Whether every store that needed a review email actually got one. */
  emailSent: boolean;
  /** Why one didn't, when one didn't — unset key, no recipient, API error. */
  emailError: string | null;
  /**
   * The review email's own HTML, handed back when it could not be sent so the
   * admin console can render it and the merchant can click the same one-click
   * links in-app. Only for a run scoped to ONE store — a platform-wide sweep
   * would otherwise return one store's review page to whoever ran it.
   */
  reviewHtml: string | null;
}

/**
 * Rebuilds review items for attributions an earlier run already queued and
 * nobody has confirmed yet, skipping the lines this run just created.
 *
 * `choiceIndex` is carried through deliberately: the confirm route indexes into
 * the row's stored `candidateProductIds` (server/posAttributionRoutes.ts), so a
 * candidate whose product has since been deleted has to leave its slot behind
 * rather than shift every later link onto the wrong piece.
 */
async function collectStillPendingPosItems(
  tenantId: number,
  freshItems: PosAttributionReviewItem[],
): Promise<PosAttributionReviewItem[]> {
  const rows = await getPendingPosAttributions(tenantId, MAX_REVIEW_ITEMS);
  const fresh = new Set(freshItems.map((i) => i.posOrderItemId));
  const older = rows.filter((r) => !fresh.has(r.posOrderItemId));
  if (older.length === 0) return [];

  const candidatesByRow = await resolveStoredCandidates(tenantId, older);

  const items = older
    .map((row, i) => ({
      id: row.id,
      posOrderItemId: row.posOrderItemId,
      amountRappen: row.amountRappen,
      soldAt: row.soldAt,
      itemLabel: row.itemLabel,
      candidates: candidatesByRow[i],
      token: row.confirmationToken,
    }))
    // Every candidate piece has since been deleted, so there is nothing left to
    // attribute the sale to. It stays pending for manual handling. A null token
    // means the row was decided between the two queries — nothing left to ask.
    .filter(
      (item): item is typeof item & { token: string } =>
        item.candidates.length > 0 && item.token !== null,
    );

  // Re-sending puts these links in front of the merchant again, so their clock
  // restarts today — see the Stripe sibling in reconciliation.ts.
  await extendReviewTokenExpiry(
    "pos_attributions",
    tenantId,
    items.map((item) => item.id),
    reviewTokenExpiry(),
  );

  return items.map(({ id: _id, ...item }) => item);
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
      // The mailed link is a bearer credential, so it gets a lifetime from the
      // moment it is issued (server/reviewToken.ts).
      tokenExpiresAt: reviewTokenExpiry(),
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

  // Anything an earlier run queued and nobody confirmed goes back in the
  // envelope. Pressing the button twice is not a mistake to guard against —
  // the first email may have bounced, or never been sent at all — and
  // getUnattributedPosLineItems deliberately skips those lines, so this is the
  // only way they are ever asked about again.
  //
  // Only for a run scoped to one store: a platform-wide sweep has no single
  // caller to show a backlog to, and re-reading every tenant's queue would turn
  // a nightly job into an n-query crawl.
  let stillPendingCount = 0;
  if (tenantId !== undefined) {
    const fresh = reviewItemsByTenant.get(tenantId) ?? [];
    const stillPending = await collectStillPendingPosItems(tenantId, fresh);
    if (stillPending.length > 0) {
      // Newly found lines first, so a long backlog can never crowd out what
      // this run just picked up. The remainder waits for the next run.
      const merged = [...fresh, ...stillPending].slice(0, MAX_REVIEW_ITEMS);
      stillPendingCount = Math.max(0, merged.length - fresh.length);
      reviewItemsByTenant.set(tenantId, merged);
    }
  }

  // One review email per store, addressed to that store's own admin with the
  // store's own branding — mirroring runStripeReconciliationForTenant. A
  // failure for one tenant doesn't stop the others' emails going out.
  let emailsSent = 0;
  let emailError: string | null = null;
  let reviewHtml: string | null = null;
  for (const [id, items] of Array.from(reviewItemsByTenant.entries())) {
    const [tenant, contact, settings] = await Promise.all([
      getTenantById(id),
      getTenantAdminContact(id),
      getTenantSettings(id),
    ]);
    const branding = {
      tenantName: settings?.whiteLabelName ?? tenant?.name,
      tenantDomain: toBaseUrl(
        settings?.publicDomain ??
          process.env.PUBLIC_BASE_URL ??
          BRAND.url,
      ),
      contactEmail: settings?.contactEmail ?? undefined,
      to: contact?.email ?? undefined,
    };

    let reason: string | null = null;
    try {
      const result = await sendPosAttributionReviewEmail(items, branding);
      if (result.sent) emailsSent++;
      else reason = result.reason;
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }

    if (reason) {
      console.error(
        `[PosAttribution] Review email not delivered for tenant ${id}: ${reason}`,
      );
      emailError ??= reason;
      // The merchant still has to be able to act on these, so hand the caller
      // the very same page the email would have carried — same tokens, same
      // one-click links — for the admin console to render in place.
      if (id === tenantId) {
        reviewHtml = buildPosAttributionReviewHtml(items, branding);
      }
    }
  }

  const totalPendingReview = Array.from(reviewItemsByTenant.values()).reduce(
    (sum, items) => sum + items.length,
    0,
  );

  return {
    scannedLines: lines.length,
    newPendingReview,
    newNoCandidates,
    stillPendingReview: stillPendingCount,
    totalPendingReview,
    // True only when every store that needed a review email got one.
    emailSent:
      reviewItemsByTenant.size > 0 && emailsSent === reviewItemsByTenant.size,
    emailError,
    reviewHtml,
  };
}
