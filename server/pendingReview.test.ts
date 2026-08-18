import { describe, expect, it, vi, beforeEach } from "vitest";

const getPendingStripeReconciliations = vi.fn();
const getPendingPosAttributions = vi.fn();
const getProductsByIds = vi.fn();
const getProductById = vi.fn();
const getStripeReconciliationById = vi.fn();
const getPosAttributionById = vi.fn();
const rejectStripeReconciliation = vi.fn();
const rejectPosAttribution = vi.fn();
const resolveStripeReconciliationConfirmed = vi.fn();
const resolvePosAttributionConfirmed = vi.fn();

vi.mock("./db", () => ({
  getPendingStripeReconciliations: (...a: unknown[]) =>
    getPendingStripeReconciliations(...a),
  getPendingPosAttributions: (...a: unknown[]) =>
    getPendingPosAttributions(...a),
  getProductsByIds: (...a: unknown[]) => getProductsByIds(...a),
  getProductById: (...a: unknown[]) => getProductById(...a),
  getStripeReconciliationById: (...a: unknown[]) =>
    getStripeReconciliationById(...a),
  getPosAttributionById: (...a: unknown[]) => getPosAttributionById(...a),
  rejectStripeReconciliation: (...a: unknown[]) =>
    rejectStripeReconciliation(...a),
  rejectPosAttribution: (...a: unknown[]) => rejectPosAttribution(...a),
  resolveStripeReconciliationConfirmed: (...a: unknown[]) =>
    resolveStripeReconciliationConfirmed(...a),
  resolvePosAttributionConfirmed: (...a: unknown[]) =>
    resolvePosAttributionConfirmed(...a),
}));

import {
  listPendingReview,
  PendingResolveError,
  resolvePendingPos,
  resolvePendingStripe,
} from "./pendingReview";

const TENANT = 42;

function product(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Stück ${id}`,
    nameEn: `Piece ${id}`,
    price: "100.00",
    sold: false,
    quantity: 1,
    ...over,
  };
}

function stripeRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    stripePaymentIntentId: "pi_1",
    amountRappen: 10000,
    currency: "chf",
    stripeCreatedAt: new Date("2026-08-14T16:05:00Z"),
    status: "pending_review",
    candidateProductIds: "7,8",
    confirmationToken: "tok_secret",
    ...over,
  };
}

function posRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    tenantId: TENANT,
    posOrderItemId: 900,
    amountRappen: 4500,
    soldAt: new Date("2026-08-16T11:20:00Z"),
    itemLabel: "Custom",
    status: "pending_review",
    candidateProductIds: "7",
    confirmationToken: "tok_secret",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPendingStripeReconciliations.mockResolvedValue([]);
  getPendingPosAttributions.mockResolvedValue([]);
  getProductsByIds.mockResolvedValue([]);
  getProductById.mockResolvedValue(undefined);
});

describe("listPendingReview", () => {
  it("returns both queues with their candidates resolved", async () => {
    getPendingStripeReconciliations.mockResolvedValue([stripeRow()]);
    getPendingPosAttributions.mockResolvedValue([posRow()]);
    getProductsByIds.mockResolvedValue([product(7), product(8)]);

    const result = await listPendingReview(TENANT);

    expect(result.stripe).toHaveLength(1);
    expect(result.stripe[0]).toMatchObject({
      id: 1,
      stripePaymentIntentId: "pi_1",
      amountRappen: 10000,
    });
    expect(result.stripe[0].candidates.map((c) => c.id)).toEqual([7, 8]);
    expect(result.pos[0]).toMatchObject({ id: 5, posOrderItemId: 900 });
  });

  it("never hands the confirmation token to the client", async () => {
    // The token is a bearer credential: anyone holding it can spend it without
    // logging in. The console has a session and does not need one.
    getPendingStripeReconciliations.mockResolvedValue([stripeRow()]);
    getPendingPosAttributions.mockResolvedValue([posRow()]);
    getProductsByIds.mockResolvedValue([product(7), product(8)]);

    const result = await listPendingReview(TENANT);
    expect(JSON.stringify(result)).not.toContain("tok_secret");
  });

  it("scopes both queues to the tenant", async () => {
    await listPendingReview(TENANT);
    expect(getPendingStripeReconciliations).toHaveBeenCalledWith(
      TENANT,
      expect.any(Number),
    );
    expect(getPendingPosAttributions).toHaveBeenCalledWith(
      TENANT,
      expect.any(Number),
    );
  });

  it("keeps a candidate's stored position when an earlier one was deleted", async () => {
    // The emailed links index into candidateProductIds, so the survivors must
    // not be renumbered even though this list addresses products by id.
    getPendingStripeReconciliations.mockResolvedValue([
      stripeRow({ candidateProductIds: "7,8,9" }),
    ]);
    getProductsByIds.mockResolvedValue([product(9)]);

    const result = await listPendingReview(TENANT);
    expect(result.stripe[0].candidates).toEqual([
      expect.objectContaining({ id: 9, choiceIndex: 2 }),
    ]);
  });

  it("omits a row whose candidate pieces have all been deleted", async () => {
    getPendingStripeReconciliations.mockResolvedValue([stripeRow()]);
    getPendingPosAttributions.mockResolvedValue([posRow()]);
    getProductsByIds.mockResolvedValue([]);

    const result = await listPendingReview(TENANT);
    expect(result.stripe).toEqual([]);
    expect(result.pos).toEqual([]);
  });
});

describe("resolvePendingStripe", () => {
  it("records the sale and reports the piece back", async () => {
    getStripeReconciliationById.mockResolvedValue(stripeRow());
    getProductById.mockResolvedValue(product(7));

    const result = await resolvePendingStripe(TENANT, 1, 7);

    expect(resolveStripeReconciliationConfirmed).toHaveBeenCalledWith(
      1,
      7,
      10000,
      "pi_1",
    );
    expect(result).toEqual({ productName: "Piece 7", amountRappen: 10000 });
  });

  it("sets a payment aside without touching stock when nothing matches", async () => {
    getStripeReconciliationById.mockResolvedValue(stripeRow());

    const result = await resolvePendingStripe(TENANT, 1, null);

    expect(rejectStripeReconciliation).toHaveBeenCalledWith(1);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
    expect(result.productName).toBeNull();
  });

  // Ids are sequential and guessable, so the tenant predicate on the read is
  // what stops an admin of another store deciding this one's payment. It comes
  // back as not_found, indistinguishable from a row that never existed.
  it("refuses a row belonging to another store", async () => {
    getStripeReconciliationById.mockResolvedValue(undefined);

    await expect(resolvePendingStripe(TENANT, 1, 7)).rejects.toMatchObject({
      reason: "not_found",
    });
    expect(getStripeReconciliationById).toHaveBeenCalledWith(TENANT, 1);
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("refuses a row someone has already decided", async () => {
    getStripeReconciliationById.mockResolvedValue(
      stripeRow({ status: "confirmed" }),
    );

    await expect(resolvePendingStripe(TENANT, 1, 7)).rejects.toMatchObject({
      reason: "already_handled",
    });
  });

  it("refuses a piece that is not one of this payment's candidates", async () => {
    getStripeReconciliationById.mockResolvedValue(stripeRow());
    getProductById.mockResolvedValue(product(99));

    await expect(resolvePendingStripe(TENANT, 1, 99)).rejects.toMatchObject({
      reason: "not_a_candidate",
    });
    // Refused before any stock is touched.
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });

  it("refuses a piece that has since sold out", async () => {
    getStripeReconciliationById.mockResolvedValue(stripeRow());
    getProductById.mockResolvedValue(product(7, { quantity: 0, sold: true }));

    await expect(resolvePendingStripe(TENANT, 1, 7)).rejects.toBeInstanceOf(
      PendingResolveError,
    );
    expect(resolveStripeReconciliationConfirmed).not.toHaveBeenCalled();
  });
});

describe("resolvePendingPos", () => {
  it("attributes the sale to the chosen piece", async () => {
    getPosAttributionById.mockResolvedValue(posRow());
    getProductById.mockResolvedValue(product(7));

    const result = await resolvePendingPos(TENANT, 5, 7);

    expect(resolvePosAttributionConfirmed).toHaveBeenCalledWith(
      5,
      900,
      7,
      TENANT,
    );
    expect(result).toEqual({ productName: "Piece 7", amountRappen: 4500 });
  });

  it("sets a sale aside without touching stock", async () => {
    getPosAttributionById.mockResolvedValue(posRow());

    await resolvePendingPos(TENANT, 5, null);

    expect(rejectPosAttribution).toHaveBeenCalledWith(5);
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });

  it("refuses a row belonging to another store", async () => {
    getPosAttributionById.mockResolvedValue(undefined);

    await expect(resolvePendingPos(TENANT, 5, 7)).rejects.toMatchObject({
      reason: "not_found",
    });
    expect(getPosAttributionById).toHaveBeenCalledWith(TENANT, 5);
  });

  it("refuses a piece that is not one of this sale's candidates", async () => {
    getPosAttributionById.mockResolvedValue(posRow());
    getProductById.mockResolvedValue(product(99));

    await expect(resolvePendingPos(TENANT, 5, 99)).rejects.toMatchObject({
      reason: "not_a_candidate",
    });
    expect(resolvePosAttributionConfirmed).not.toHaveBeenCalled();
  });
});
