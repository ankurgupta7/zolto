import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, limiterMock } = vi.hoisted(() => ({
  dbMock: {
    getDiscountCodes: vi.fn(),
    getDiscountCodeByCode: vi.fn(),
    createDiscountCodes: vi.fn(),
    updateDiscountCode: vi.fn(),
    deleteDiscountCode: vi.fn(),
    getDiscountRedemptions: vi.fn(),
    getProductsByIds: vi.fn(),
    getTenantSettings: vi.fn(),
    // Read by the expired-hold sweep the admin list runs first.
    getExpiredDiscountHolds: vi.fn(),
    markDiscountRedemptionReleased: vi.fn(),
    releaseDiscountRedemptionSlot: vi.fn(),
    getDiscountRedemptionBySession: vi.fn(),
    claimDiscountRedemptionSlot: vi.fn(),
    createDiscountRedemption: vi.fn(),
    confirmDiscountRedemption: vi.fn(),
    DISCOUNT_HOLD_TTL_MS: 30 * 60 * 1000,
  },
  limiterMock: { check: vi.fn() },
}));

vi.mock("../db", () => dbMock);
vi.mock("../rateLimit", () => ({
  createRateLimiter: () => limiterMock,
}));

import { discountsRouter } from "./discounts";
import type { TrpcContext } from "../_core/context";

const TENANT_ID = 7;
const OTHER_TENANT_ID = 8;

function ctx(
  opts: {
    role?: "staff" | "admin";
    userTenantId?: number;
    tenant?: number | null;
  } = {},
): TrpcContext {
  const { role, userTenantId = TENANT_ID, tenant = TENANT_ID } = opts;
  return {
    user: role ? ({ id: 1, tenantId: userTenantId, role } as never) : null,
    tenant: tenant === null ? null : ({ id: tenant, slug: "shop" } as never),
    req: { ip: "203.0.113.9" } as never,
    res: {} as never,
  };
}

const CODE_ROW = {
  id: 5,
  tenantId: TENANT_ID,
  code: "WELCOME10",
  kind: "percent" as const,
  value: 10,
  currency: null,
  campaign: "spring",
  minSubtotalRappen: null,
  maxRedemptions: null,
  redeemedCount: 0,
  startsAt: null,
  expiresAt: null,
  active: true,
  createdBy: 1,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

const PRODUCT = {
  id: 21,
  price: "50.00",
  sold: false,
  visible: true,
  quantity: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getDiscountCodes.mockResolvedValue([CODE_ROW]);
  dbMock.getDiscountCodeByCode.mockResolvedValue(undefined);
  dbMock.updateDiscountCode.mockResolvedValue(true);
  dbMock.getDiscountRedemptions.mockResolvedValue([]);
  dbMock.getProductsByIds.mockResolvedValue([PRODUCT]);
  dbMock.getTenantSettings.mockResolvedValue({ currency: "chf" });
  dbMock.getExpiredDiscountHolds.mockResolvedValue([]);
  dbMock.markDiscountRedemptionReleased.mockResolvedValue(true);
  limiterMock.check.mockResolvedValue({ allowed: true, remaining: 29 });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("discounts.create (admin)", () => {
  const terms = { kind: "percent" as const, value: 10 };

  it("mints a generated code against the addressed store", async () => {
    const result = await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .create(terms);
    expect(result.codes).toHaveLength(1);
    expect(dbMock.createDiscountCodes).toHaveBeenCalledWith([
      expect.objectContaining({
        tenantId: TENANT_ID,
        kind: "percent",
        value: 10,
        createdBy: 1,
      }),
    ]);
  });

  it("mints a whole batch of distinct codes in one insert", async () => {
    const result = await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .create({ ...terms, count: 25, prefix: "XMAS" });
    expect(result.codes).toHaveLength(25);
    expect(new Set(result.codes).size).toBe(25);
    for (const code of result.codes)
      expect(code.startsWith("XMAS-")).toBe(true);
    expect(dbMock.createDiscountCodes).toHaveBeenCalledTimes(1);
    expect(dbMock.createDiscountCodes.mock.calls[0][0]).toHaveLength(25);
  });

  it("accepts a code the merchant chose, normalised", async () => {
    const result = await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .create({ ...terms, code: " friends family " });
    expect(result.codes).toEqual(["FRIENDSFAMILY"]);
  });

  it("refuses to give fifty codes the same merchant-chosen name", async () => {
    await expect(
      discountsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ ...terms, code: "SPRING", count: 50 }),
    ).rejects.toThrow(/one at a time/i);
    expect(dbMock.createDiscountCodes).not.toHaveBeenCalled();
  });

  it("refuses a code the store already has, rather than a duplicate-key 500", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue(CODE_ROW);
    await expect(
      discountsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ ...terms, code: "WELCOME10" }),
    ).rejects.toThrow(/already exists/i);
    expect(dbMock.createDiscountCodes).not.toHaveBeenCalled();
  });

  it("refuses a percentage over 100 — that is a refund, not a discount", async () => {
    await expect(
      discountsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ kind: "percent", value: 120 }),
    ).rejects.toThrow(/100%/);
  });

  it("refuses an end date before the start date", async () => {
    await expect(
      discountsRouter.createCaller(ctx({ role: "admin" })).create({
        ...terms,
        startsAt: new Date("2026-12-01T00:00:00Z"),
        expiresAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ).rejects.toThrow(/after the start date/i);
  });

  it("denominates a fixed amount in the store's own currency", async () => {
    dbMock.getTenantSettings.mockResolvedValue({ currency: "eur" });
    await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .create({ kind: "amount", value: 1500 });
    expect(dbMock.createDiscountCodes).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "amount", currency: "eur" }),
    ]);
  });

  it("leaves a percentage code currency-free, so it works in any currency", async () => {
    await discountsRouter.createCaller(ctx({ role: "admin" })).create(terms);
    expect(dbMock.createDiscountCodes).toHaveBeenCalledWith([
      expect.objectContaining({ currency: null }),
    ]);
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      discountsRouter.createCaller(ctx()).create(terms),
    ).rejects.toThrow();
    expect(dbMock.createDiscountCodes).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin", async () => {
    await expect(
      discountsRouter.createCaller(ctx({ role: "staff" })).create(terms),
    ).rejects.toThrow();
  });

  // The case that silently regresses.
  it("refuses an admin of a DIFFERENT store addressing this one", async () => {
    const caller = discountsRouter.createCaller(
      ctx({ role: "admin", userTenantId: OTHER_TENANT_ID, tenant: TENANT_ID }),
    );
    await expect(caller.create(terms)).rejects.toThrow();
    await expect(caller.list()).rejects.toThrow();
    await expect(caller.update({ id: 5, active: false })).rejects.toThrow();
    await expect(caller.delete({ id: 5 })).rejects.toThrow();
    await expect(caller.redemptions({ id: 5 })).rejects.toThrow();
    expect(dbMock.createDiscountCodes).not.toHaveBeenCalled();
    expect(dbMock.updateDiscountCode).not.toHaveBeenCalled();
    expect(dbMock.deleteDiscountCode).not.toHaveBeenCalled();
  });
});

describe("discounts.list (admin)", () => {
  it("scopes to the addressed store and describes the terms in words", async () => {
    const rows = await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .list();
    expect(dbMock.getDiscountCodes).toHaveBeenCalledWith(TENANT_ID);
    expect(rows[0]).toMatchObject({
      code: "WELCOME10",
      description: "10% off",
    });
  });
});

describe("discounts.update (admin)", () => {
  it("switches a code off", async () => {
    await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .update({ id: 5, active: false });
    expect(dbMock.updateDiscountCode).toHaveBeenCalledWith(TENANT_ID, 5, {
      active: false,
    });
  });

  // A code already sitting in a customer's inbox has to keep meaning what it
  // said when it was sent. The input schema has no field for the money, so an
  // attempt to change it is dropped rather than written.
  it("cannot rewrite the code, its kind or its value", async () => {
    await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      // @ts-expect-error — the input schema deliberately omits these.
      .update({ id: 5, value: 90, kind: "amount", code: "CHEAPER" });
    const patch = dbMock.updateDiscountCode.mock.calls[0][2];
    expect(patch).not.toHaveProperty("value");
    expect(patch).not.toHaveProperty("kind");
    expect(patch).not.toHaveProperty("code");
  });

  it("reports a missing row rather than claiming success", async () => {
    dbMock.updateDiscountCode.mockResolvedValue(false);
    await expect(
      discountsRouter
        .createCaller(ctx({ role: "admin" }))
        .update({ id: 999, active: false }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("discounts.delete (admin)", () => {
  it("deletes a code nobody has used", async () => {
    await discountsRouter
      .createCaller(ctx({ role: "admin" }))
      .delete({ id: 5 });
    expect(dbMock.deleteDiscountCode).toHaveBeenCalledWith(TENANT_ID, 5);
  });

  it("keeps a code that paid for real orders, and says to switch it off", async () => {
    dbMock.getDiscountCodes.mockResolvedValue([
      { ...CODE_ROW, redeemedCount: 3 },
    ]);
    await expect(
      discountsRouter.createCaller(ctx({ role: "admin" })).delete({ id: 5 }),
    ).rejects.toThrow(/switch it off/i);
    expect(dbMock.deleteDiscountCode).not.toHaveBeenCalled();
  });

  it("refuses to delete another store's code even by id", async () => {
    dbMock.getDiscountCodes.mockResolvedValue([]);
    await expect(
      discountsRouter.createCaller(ctx({ role: "admin" })).delete({ id: 99 }),
    ).rejects.toThrow(/not found/i);
    expect(dbMock.deleteDiscountCode).not.toHaveBeenCalled();
  });
});

describe("discounts.check (public)", () => {
  const basket = { code: "WELCOME10", productIds: [21] };

  beforeEach(() => {
    dbMock.getDiscountCodeByCode.mockResolvedValue(CODE_ROW);
  });

  it("computes the subtotal from the store's own rows, not from the request", async () => {
    const result = await discountsRouter.createCaller(ctx()).check(basket);
    expect(dbMock.getProductsByIds).toHaveBeenCalledWith(TENANT_ID, [21]);
    expect(result).toMatchObject({
      valid: true,
      subtotalRappen: 5000,
      amountOffRappen: 500,
      currency: "chf",
    });
  });

  it("looks the code up in the addressed store only", async () => {
    await discountsRouter.createCaller(ctx()).check(basket);
    expect(dbMock.getDiscountCodeByCode).toHaveBeenCalledWith(
      TENANT_ID,
      "WELCOME10",
    );
  });

  it("normalises what the shopper typed", async () => {
    await discountsRouter
      .createCaller(ctx())
      .check({ ...basket, code: " welcome10 " });
    expect(dbMock.getDiscountCodeByCode).toHaveBeenCalledWith(
      TENANT_ID,
      "WELCOME10",
    );
  });

  it("ignores pieces that are sold or hidden when totalling the basket", async () => {
    dbMock.getProductsByIds.mockResolvedValue([
      PRODUCT,
      { id: 22, price: "100.00", sold: true, visible: true, quantity: 0 },
      { id: 23, price: "80.00", sold: false, visible: false, quantity: 1 },
    ]);
    const result = await discountsRouter
      .createCaller(ctx())
      .check({ ...basket, productIds: [21, 22, 23] });
    expect(result).toMatchObject({
      subtotalRappen: 5000,
      amountOffRappen: 500,
    });
  });

  it("says nothing at all about a code it has never heard of", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue(undefined);
    expect(await discountsRouter.createCaller(ctx()).check(basket)).toEqual({
      valid: false,
      message: "That discount code isn't valid for this basket.",
    });
  });

  it("gives a real code that has been switched off its real reason", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue({
      ...CODE_ROW,
      active: false,
    });
    const result = await discountsRouter.createCaller(ctx()).check(basket);
    expect(result).toMatchObject({ valid: false });
    expect(result.message).toMatch(/no longer available/i);
  });

  it("tells a shopper what they can act on — the basket minimum", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue({
      ...CODE_ROW,
      minSubtotalRappen: 10_000,
    });
    const result = await discountsRouter.createCaller(ctx()).check(basket);
    expect(result).toMatchObject({ valid: false });
    expect(result.message).toContain("CHF 100.00");
  });

  it("refuses an exhausted code", async () => {
    dbMock.getDiscountCodeByCode.mockResolvedValue({
      ...CODE_ROW,
      maxRedemptions: 1,
      redeemedCount: 1,
    });
    const result = await discountsRouter.createCaller(ctx()).check(basket);
    expect(result).toMatchObject({ valid: false });
    expect(result.message).toMatch(/redeemed/i);
  });

  it("never holds a redemption slot — typing a code must not spend it", async () => {
    await discountsRouter.createCaller(ctx()).check(basket);
    expect(dbMock.updateDiscountCode).not.toHaveBeenCalled();
  });

  // A code is a short secret and this endpoint says whether a guess was right.
  it("is rate limited per caller", async () => {
    limiterMock.check.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
    await expect(
      discountsRouter.createCaller(ctx()).check(basket),
    ).rejects.toThrow(/too many attempts/i);
    expect(dbMock.getDiscountCodeByCode).not.toHaveBeenCalled();
  });

  it("keys the rate limit on the caller's address", async () => {
    await discountsRouter.createCaller(ctx()).check(basket);
    expect(limiterMock.check).toHaveBeenCalledWith(
      "discount-check:203.0.113.9",
    );
  });

  it("throws NOT_FOUND when no store is resolved", async () => {
    await expect(
      discountsRouter.createCaller(ctx({ tenant: null })).check(basket),
    ).rejects.toThrow(/not found/i);
  });
});
