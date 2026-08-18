/**
 * The outstanding-review queue, and the merchant's way to clear it in-console.
 *
 * Both day-end scans (`reconciliation.ts` for Stripe payments with no local
 * record, `posAttribution.ts` for amount-only till sales) file a row and then
 * ask the merchant by email. Email is not a dependable channel: a key may be
 * unset, a domain unverified, a message binned. Everything here is the version
 * that does not involve email at all — a list of what is still waiting, and
 * two resolvers the admin console calls directly, authenticated by the admin's
 * own session rather than by a mailed token.
 *
 * The confirmation tokens deliberately do NOT leave this module. A token is a
 * bearer credential that anyone holding it can spend; the console has a logged-in
 * admin and does not need one, so the list is keyed by row id instead.
 */

import {
  getPendingPosAttributions,
  getPendingStripeReconciliations,
  getPosAttributionById,
  getProductById,
  getProductsByIds,
  getStripeReconciliationById,
  rejectPosAttribution,
  rejectStripeReconciliation,
  resolvePosAttributionConfirmed,
  resolveStripeReconciliationConfirmed,
} from "./db";

/** How many outstanding items one list call returns, newest first. */
export const MAX_PENDING_LISTED = 100;

export interface PendingCandidate {
  id: number;
  name: string;
  nameEn: string | null;
  price: string;
  /**
   * This candidate's position in the row's stored `candidateProductIds`. The
   * emailed links index into that list, so it is kept even here, where the
   * console addresses products by id — a deleted piece must leave its slot
   * behind rather than renumber the ones after it.
   */
  choiceIndex: number;
}

export interface PendingStripeItem {
  id: number;
  stripePaymentIntentId: string;
  amountRappen: number;
  currency: string;
  stripeCreatedAt: Date;
  candidates: PendingCandidate[];
}

export interface PendingPosItem {
  id: number;
  posOrderItemId: number;
  amountRappen: number;
  soldAt: Date;
  /** The custom label typed at the till, if any. */
  itemLabel: string | null;
  candidates: PendingCandidate[];
}

export interface PendingReview {
  stripe: PendingStripeItem[];
  pos: PendingPosItem[];
}

export function parseCandidateIds(candidateProductIds: string): number[] {
  return candidateProductIds
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Resolves each row's stored candidate ids to products in one query, keeping
 * every candidate's stored position and dropping the ones whose product has
 * since been deleted.
 */
export async function resolveStoredCandidates(
  tenantId: number,
  rows: { candidateProductIds: string }[],
): Promise<PendingCandidate[][]> {
  const idsByRow = rows.map((row) =>
    parseCandidateIds(row.candidateProductIds),
  );
  const products = await getProductsByIds(
    tenantId,
    Array.from(new Set(idsByRow.flat())),
  );
  const byId = new Map(products.map((p) => [p.id, p]));

  return idsByRow.map((ids) =>
    ids
      .map((productId, choiceIndex) => {
        const product = byId.get(productId);
        return product
          ? {
              id: product.id,
              name: product.name,
              nameEn: product.nameEn ?? null,
              price: product.price,
              choiceIndex,
            }
          : null;
      })
      .filter((c): c is PendingCandidate => c !== null),
  );
}

/**
 * Everything this store has been asked to confirm and hasn't. Rows whose
 * candidate pieces have all since been deleted are omitted: there is nothing
 * left to assign them to, and offering an empty row invites a merchant to
 * think the list is broken.
 */
export async function listPendingReview(
  tenantId: number,
): Promise<PendingReview> {
  const [stripeRows, posRows] = await Promise.all([
    getPendingStripeReconciliations(tenantId, MAX_PENDING_LISTED),
    getPendingPosAttributions(tenantId, MAX_PENDING_LISTED),
  ]);

  const [stripeCandidates, posCandidates] = await Promise.all([
    resolveStoredCandidates(tenantId, stripeRows),
    resolveStoredCandidates(tenantId, posRows),
  ]);

  return {
    stripe: stripeRows
      .map((row, i) => ({
        id: row.id,
        stripePaymentIntentId: row.stripePaymentIntentId,
        amountRappen: row.amountRappen,
        currency: row.currency,
        stripeCreatedAt: row.stripeCreatedAt,
        candidates: stripeCandidates[i],
      }))
      .filter((item) => item.candidates.length > 0),
    pos: posRows
      .map((row, i) => ({
        id: row.id,
        posOrderItemId: row.posOrderItemId,
        amountRappen: row.amountRappen,
        soldAt: row.soldAt,
        itemLabel: row.itemLabel,
        candidates: posCandidates[i],
      }))
      .filter((item) => item.candidates.length > 0),
  };
}

/**
 * Why a resolve could not be applied. The router turns these into tRPC codes;
 * keeping them as data means the rules live with the logic they guard rather
 * than in the transport.
 */
export type PendingResolveFailure =
  | "not_found"
  | "already_handled"
  | "not_a_candidate"
  | "unavailable";

export class PendingResolveError extends Error {
  constructor(
    readonly reason: PendingResolveFailure,
    message: string,
  ) {
    super(message);
    this.name = "PendingResolveError";
  }
}

/** The product's display name, for the confirmation the merchant reads back. */
export interface PendingResolveResult {
  productName: string | null;
  amountRappen: number;
}

/**
 * Applies the merchant's decision to one unmatched Stripe payment.
 * `productId` null means "none of these" — the payment is left for manual
 * handling and stock is untouched.
 *
 * Every read is scoped by `tenantId`, so an admin of another store addressing
 * this row by id gets `not_found` rather than a decision on someone else's
 * inventory. That is the same guarantee the mailed token gave by being secret.
 */
export async function resolvePendingStripe(
  tenantId: number,
  id: number,
  productId: number | null,
): Promise<PendingResolveResult> {
  const row = await getStripeReconciliationById(tenantId, id);
  if (!row) {
    throw new PendingResolveError(
      "not_found",
      "That payment is no longer in your review queue.",
    );
  }
  if (row.status !== "pending_review") {
    throw new PendingResolveError(
      "already_handled",
      "That payment has already been reviewed.",
    );
  }

  if (productId === null) {
    await rejectStripeReconciliation(row.id);
    return { productName: null, amountRappen: row.amountRappen };
  }

  // Only the pieces this row was filed against may be chosen — the same
  // constraint the emailed `choice=N` links impose by construction.
  if (!parseCandidateIds(row.candidateProductIds).includes(productId)) {
    throw new PendingResolveError(
      "not_a_candidate",
      "That piece is not one of this payment's candidates.",
    );
  }

  const product = await getProductById(tenantId, productId);
  if (!product || product.sold || product.quantity <= 0) {
    throw new PendingResolveError(
      "unavailable",
      "That piece is already marked sold or out of stock.",
    );
  }

  await resolveStripeReconciliationConfirmed(
    row.id,
    productId,
    row.amountRappen,
    row.stripePaymentIntentId,
  );
  return {
    productName: product.nameEn ?? product.name,
    amountRappen: row.amountRappen,
  };
}

/** The in-person sibling: attributes an amount-only till sale to a piece. */
export async function resolvePendingPos(
  tenantId: number,
  id: number,
  productId: number | null,
): Promise<PendingResolveResult> {
  const row = await getPosAttributionById(tenantId, id);
  if (!row) {
    throw new PendingResolveError(
      "not_found",
      "That sale is no longer in your review queue.",
    );
  }
  if (row.status !== "pending_review") {
    throw new PendingResolveError(
      "already_handled",
      "That sale has already been confirmed.",
    );
  }

  if (productId === null) {
    await rejectPosAttribution(row.id);
    return { productName: null, amountRappen: row.amountRappen };
  }

  if (!parseCandidateIds(row.candidateProductIds).includes(productId)) {
    throw new PendingResolveError(
      "not_a_candidate",
      "That piece is not one of this sale's candidates.",
    );
  }

  const product = await getProductById(tenantId, productId);
  if (!product || product.sold || product.quantity <= 0) {
    throw new PendingResolveError(
      "unavailable",
      "That piece is already marked sold or out of stock.",
    );
  }

  await resolvePosAttributionConfirmed(
    row.id,
    row.posOrderItemId,
    productId,
    tenantId,
  );
  return {
    productName: product.nameEn ?? product.name,
    amountRappen: row.amountRappen,
  };
}
