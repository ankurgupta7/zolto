import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    DISCOUNT_HOLD_TTL_MS: 30 * 60 * 1000,
    getDiscountCodeByCode: vi.fn(),
    claimDiscountRedemptionSlot: vi.fn(),
    releaseDiscountRedemptionSlot: vi.fn(),
    createDiscountRedemption: vi.fn(),
    getDiscountRedemptionBySession: vi.fn(),
    confirmDiscountRedemption: vi.fn(),
    markDiscountRedemptionReleased: vi.fn(),
    getExpiredDiscountHolds: vi.fn(),
  },
}));

vi.mock("./db", () => dbMock);

import {
  claimDiscount,
  confirmDiscountForSession,
  recordDiscountHold,
  releaseDiscountClaim,
  sweepExpiredDiscountHolds,
} from "./discounts";

const TENANT_ID = 7;

const CODE_ROW = {
  id: 5,
  tenantId: TENANT_ID,
  code: "WELCOME10",
  kind: "percent" as const,
  value: 10,
  currency: null,
  minSubtotalRappen: null,
  maxRedemptions: null,
  redeemedCount: 0,
  startsAt: null,
  expiresAt: null,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getDiscountCodeByCode.mockResolvedValue(CODE_ROW);
  dbMock.claimDiscountRedemptionSlot.mockResolvedValue(true);
  dbMock.markDiscountRedemptionReleased.mockResolvedValue(true);
  dbMock.getExpiredDiscountHolds.mockResolvedValue([]);
  dbMock.getDiscountRedemptionBySession.mockResolvedValue(undefined);
  // Reset the writes too: clearAllMocks forgets calls, not implementations, so
  // a test that makes one of these reject would otherwise poison the next.
  dbMock.releaseDiscountRedemptionSlot.mockResolvedValue(undefined);
  dbMock.confirmDiscountRedemption.mockResolvedValue(true);
  dbMock.createDiscountRedemption.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const basket = {
  tenantId: TENANT_ID,
  rawCode: "welcome10",
  subtotalRappen: 5000,
  currency: "chf",
};

describe("claimDiscount", () => {
  it("validates the code and takes a redemption slot", async () => {
    const result = await claimDiscount(basket);
    expect(result).toEqual({
      ok: true,
      discount: { codeId: 5, code: "WELCOME10", amountOffRappen: 500 },
    });
    expect(dbMock.claimDiscountRedemptionSlot).toHaveBeenCalledWith(
      TENANT_ID,
      5,
    );
  });

  it("normalises what the shopper typed before looking it up", async () => {
    await claimDiscount({ ...basket, rawCode: "  Welcome10 " });
    expect(dbMock.getDiscountCodeByCode).toHaveBeenCalledWith(
      TENANT_ID,
      "WELCOME10",
    );
  });

  it("refuses an unknown code without taking a slot", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue(undefined);
    const result = await claimDiscount(basket);
    expect(result).toMatchObject({ ok: false, reason: "unknown" });
    expect(dbMock.claimDiscountRedemptionSlot).not.toHaveBeenCalled();
  });

  it("refuses an empty code without a database round trip", async () => {
    const result = await claimDiscount({ ...basket, rawCode: "   " });
    expect(result).toMatchObject({ ok: false, reason: "unknown" });
    expect(dbMock.getDiscountCodeByCode).not.toHaveBeenCalled();
  });

  it("refuses an expired code without taking a slot", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue({
      ...CODE_ROW,
      expiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const result = await claimDiscount(basket);
    expect(result).toMatchObject({ ok: false, reason: "expired" });
    expect(dbMock.claimDiscountRedemptionSlot).not.toHaveBeenCalled();
  });

  // A percentage that rounds to nothing on a tiny basket takes nothing off the
  // price — spending a single-use code on that is the worst outcome available.
  it("refuses a code worth nothing on this basket rather than burning it", async () => {
    const result = await claimDiscount({ ...basket, subtotalRappen: 5 });
    expect(result).toMatchObject({ ok: false });
    expect(dbMock.claimDiscountRedemptionSlot).not.toHaveBeenCalled();
  });

  // The evaluation reads a row that may already be stale; the atomic claim is
  // what actually enforces the limit, and its refusal has to be honoured.
  it("refuses when the atomic claim loses the race, even though the row looked free", async () => {
    dbMock.claimDiscountRedemptionSlot.mockResolvedValue(false);
    const result = await claimDiscount(basket);
    expect(result).toMatchObject({ ok: false, reason: "exhausted" });
  });

  it("frees stale holds and retries once before declaring a code exhausted", async () => {
    dbMock.claimDiscountRedemptionSlot
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    dbMock.getExpiredDiscountHolds.mockResolvedValue([
      { stripeSessionId: "cs_stale", tenantId: TENANT_ID, discountCodeId: 5 },
    ]);

    const result = await claimDiscount(basket);
    expect(result).toMatchObject({ ok: true });
    // The sweep is scoped to this store's copy of this code — never global.
    expect(dbMock.getExpiredDiscountHolds).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      discountCodeId: 5,
    });
    expect(dbMock.releaseDiscountRedemptionSlot).toHaveBeenCalledWith(
      TENANT_ID,
      5,
    );
  });

  it("does not retry when the sweep found nothing to free", async () => {
    dbMock.claimDiscountRedemptionSlot.mockResolvedValue(false);
    await claimDiscount(basket);
    expect(dbMock.claimDiscountRedemptionSlot).toHaveBeenCalledTimes(1);
  });
});

describe("recordDiscountHold", () => {
  it("ties the claim to the session, expiring with it", async () => {
    const now = 1_000_000;
    await recordDiscountHold({
      tenantId: TENANT_ID,
      discount: { codeId: 5, code: "WELCOME10", amountOffRappen: 500 },
      stripeSessionId: "cs_test_1",
      currency: "chf",
      now,
    });
    expect(dbMock.createDiscountRedemption).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      discountCodeId: 5,
      stripeSessionId: "cs_test_1",
      amountOffRappen: 500,
      currency: "chf",
      heldUntil: new Date(now + 30 * 60 * 1000),
    });
  });
});

describe("releaseDiscountClaim", () => {
  it("gives back a claim that was never written against a session", async () => {
    await releaseDiscountClaim({ tenantId: TENANT_ID, codeId: 5 });
    expect(dbMock.releaseDiscountRedemptionSlot).toHaveBeenCalledWith(
      TENANT_ID,
      5,
    );
    expect(dbMock.markDiscountRedemptionReleased).not.toHaveBeenCalled();
  });

  it("releases the hold row and the counter together", async () => {
    await releaseDiscountClaim({
      tenantId: TENANT_ID,
      codeId: 5,
      stripeSessionId: "cs_test_1",
    });
    expect(dbMock.markDiscountRedemptionReleased).toHaveBeenCalledWith(
      "cs_test_1",
    );
    expect(dbMock.releaseDiscountRedemptionSlot).toHaveBeenCalled();
  });

  // Double-decrementing is how a limited promotion quietly gives out more
  // discounts than the merchant authorised.
  it("leaves the counter alone when the hold was already accounted for", async () => {
    dbMock.markDiscountRedemptionReleased.mockResolvedValue(false);
    dbMock.getDiscountRedemptionBySession.mockResolvedValue({
      id: 1,
      status: "confirmed",
    });
    await releaseDiscountClaim({
      tenantId: TENANT_ID,
      codeId: 5,
      stripeSessionId: "cs_test_1",
    });
    expect(dbMock.releaseDiscountRedemptionSlot).not.toHaveBeenCalled();
  });

  it("still decrements when no hold row exists at all", async () => {
    dbMock.markDiscountRedemptionReleased.mockResolvedValue(false);
    dbMock.getDiscountRedemptionBySession.mockResolvedValue(undefined);
    await releaseDiscountClaim({
      tenantId: TENANT_ID,
      codeId: 5,
      stripeSessionId: "cs_test_1",
    });
    expect(dbMock.releaseDiscountRedemptionSlot).toHaveBeenCalled();
  });

  // The caller is already handling a Stripe or DB failure; a bookkeeping error
  // must not replace the error the merchant needs to see.
  it("never throws", async () => {
    dbMock.releaseDiscountRedemptionSlot.mockRejectedValue(
      new Error("db gone"),
    );
    await expect(
      releaseDiscountClaim({ tenantId: TENANT_ID, codeId: 5 }),
    ).resolves.toBeUndefined();
  });
});

describe("confirmDiscountForSession", () => {
  it("turns the hold into a redemption that happened", async () => {
    await confirmDiscountForSession("cs_test_1", {
      orderId: 12,
      customerEmail: "anna@example.ch",
    });
    expect(dbMock.confirmDiscountRedemption).toHaveBeenCalledWith("cs_test_1", {
      orderId: 12,
      customerEmail: "anna@example.ch",
    });
  });

  // Fulfilment has already been paid for; discount bookkeeping must never be
  // what takes an order down.
  it("swallows a failure rather than failing fulfillment", async () => {
    dbMock.confirmDiscountRedemption.mockRejectedValue(new Error("db gone"));
    await expect(
      confirmDiscountForSession("cs_test_1"),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("sweepExpiredDiscountHolds", () => {
  it("releases each expired hold and reports the count", async () => {
    dbMock.getExpiredDiscountHolds.mockResolvedValue([
      { stripeSessionId: "cs_a", tenantId: TENANT_ID, discountCodeId: 5 },
      { stripeSessionId: "cs_b", tenantId: TENANT_ID, discountCodeId: 6 },
    ]);
    expect(await sweepExpiredDiscountHolds({ tenantId: TENANT_ID })).toBe(2);
    expect(dbMock.releaseDiscountRedemptionSlot).toHaveBeenCalledTimes(2);
  });

  // A hold a webhook confirmed a moment ago is a slot the customer spent.
  it("does not return a slot somebody else has already accounted for", async () => {
    dbMock.getExpiredDiscountHolds.mockResolvedValue([
      { stripeSessionId: "cs_a", tenantId: TENANT_ID, discountCodeId: 5 },
    ]);
    dbMock.markDiscountRedemptionReleased.mockResolvedValue(false);
    expect(await sweepExpiredDiscountHolds()).toBe(0);
    expect(dbMock.releaseDiscountRedemptionSlot).not.toHaveBeenCalled();
  });

  it("keeps going when one hold fails to release", async () => {
    dbMock.getExpiredDiscountHolds.mockResolvedValue([
      { stripeSessionId: "cs_a", tenantId: TENANT_ID, discountCodeId: 5 },
      { stripeSessionId: "cs_b", tenantId: TENANT_ID, discountCodeId: 6 },
    ]);
    dbMock.markDiscountRedemptionReleased
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValue(true);
    expect(await sweepExpiredDiscountHolds()).toBe(1);
  });
});
