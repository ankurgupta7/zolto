import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, billingMock, photoCreditsMock } = vi.hoisted(() => ({
  dbMock: {
    getPhotoCreditBalance: vi.fn(),
    getPhotoCreditHistory: vi.fn(),
  },
  billingMock: {
    createPlanCheckoutSession: vi.fn(),
    createPhotoCreditCheckoutSession: vi.fn(),
    isBillingConfigured: vi.fn(() => true),
    monthlyPhotoCredits: vi.fn(() => 10),
  },
  photoCreditsMock: {
    generateStyledProductPhoto: vi.fn(),
  },
}));

vi.mock("../db", () => dbMock);
vi.mock("../billing", () => billingMock);
vi.mock("../photoCredits", () => photoCreditsMock);

import { billingRouter } from "./billing";
import type { TrpcContext } from "../_core/context";

const tenant = {
  id: 7,
  slug: "aurora",
  plan: "free",
  subscriptionStatus: "trialing",
  trialEndsAt: new Date("2026-08-01"),
} as never;

function ctx(role: string | null = "admin"): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: role
      ? ({ id: 1, openId: "google:1", role, tenantId: 7 } as never)
      : null,
    tenant: role ? tenant : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getPhotoCreditBalance.mockResolvedValue(12);
  dbMock.getPhotoCreditHistory.mockResolvedValue([
    { id: 1, tenantId: 7, delta: 10, kind: "monthly_grant" },
  ]);
  billingMock.createPlanCheckoutSession.mockResolvedValue({
    url: "https://checkout.stripe.com/plan",
  });
  billingMock.createPhotoCreditCheckoutSession.mockResolvedValue({
    url: "https://checkout.stripe.com/credits",
  });
  photoCreditsMock.generateStyledProductPhoto.mockResolvedValue({
    imageUrl: "https://cdn.example.com/styled.png",
    balance: 11,
  });
});

describe("billingRouter auth", () => {
  it("rejects anonymous callers", async () => {
    const caller = billingRouter.createCaller(ctx(null));
    await expect(caller.getStatus()).rejects.toThrow();
  });

  it("rejects non-admin staff", async () => {
    const caller = billingRouter.createCaller(ctx("staff"));
    await expect(caller.getStatus()).rejects.toThrow();
  });
});

describe("billingRouter.getStatus", () => {
  it("returns plan, credit balance, and purchasable plans", async () => {
    const caller = billingRouter.createCaller(ctx());
    const status = await caller.getStatus();

    expect(status.plan).toBe("free");
    expect(status.photoCredits.balance).toBe(12);
    expect(status.photoCredits.priceChf).toBe(1);
    expect(status.plans.map((p) => p.id)).toEqual([
      "free",
      "maker",
      "studio",
      "atelier",
    ]);
    expect(status.billingConfigured).toBe(true);
  });
});

describe("billingRouter.checkout mutations", () => {
  it("creates a plan checkout for a paid plan", async () => {
    const caller = billingRouter.createCaller(ctx());
    const { url } = await caller.createPlanCheckout({ plan: "maker" });
    expect(url).toContain("checkout.stripe.com");
    expect(billingMock.createPlanCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "maker" }),
    );
  });

  it("rejects the free plan as a checkout target", async () => {
    const caller = billingRouter.createCaller(ctx());
    await expect(
      caller.createPlanCheckout({ plan: "free" as never }),
    ).rejects.toThrow();
    expect(billingMock.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it("surfaces billing misconfiguration as a readable error", async () => {
    billingMock.createPlanCheckoutSession.mockRejectedValue(
      new Error("STRIPE_PRICE_MAKER unset"),
    );
    const caller = billingRouter.createCaller(ctx());
    await expect(caller.createPlanCheckout({ plan: "maker" })).rejects.toThrow(
      /STRIPE_PRICE_MAKER/,
    );
  });

  it("creates a credit-pack checkout", async () => {
    const caller = billingRouter.createCaller(ctx());
    const { url } = await caller.purchasePhotoCredits({ quantity: 25 });
    expect(url).toContain("checkout.stripe.com");
    expect(billingMock.createPhotoCreditCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 25 }),
    );
  });

  it("validates credit quantity bounds", async () => {
    const caller = billingRouter.createCaller(ctx());
    await expect(
      caller.purchasePhotoCredits({ quantity: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.purchasePhotoCredits({ quantity: 5000 }),
    ).rejects.toThrow();
  });
});

describe("billingRouter.generateProductPhoto", () => {
  it("delegates to the photo credit service for the tenant", async () => {
    const caller = billingRouter.createCaller(ctx());
    const result = await caller.generateProductPhoto({
      productId: 42,
      stylePrompt: "Clean catalogue shot",
    });
    expect(result.imageUrl).toContain("styled.png");
    expect(photoCreditsMock.generateStyledProductPhoto).toHaveBeenCalledWith({
      tenantId: 7,
      productId: 42,
      stylePrompt: "Clean catalogue shot",
    });
  });

  it("rejects empty prompts", async () => {
    const caller = billingRouter.createCaller(ctx());
    await expect(
      caller.generateProductPhoto({ productId: 42, stylePrompt: "x" }),
    ).rejects.toThrow();
  });
});

describe("billingRouter.photoCreditHistory", () => {
  it("returns the tenant's ledger history", async () => {
    const caller = billingRouter.createCaller(ctx());
    const history = await caller.photoCreditHistory();
    expect(history).toHaveLength(1);
    expect(dbMock.getPhotoCreditHistory).toHaveBeenCalledWith(7);
  });
});
