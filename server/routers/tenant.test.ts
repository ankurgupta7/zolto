import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data + stripe layers so the router is exercised in isolation.
// vi.hoisted lets the mock objects exist before the hoisted vi.mock factories run.
const { dbMock, createStripeCustomer, buildConnectAuthorizeUrl } = vi.hoisted(
  () => ({
    dbMock: {
      db: { query: {} },
      getTenantBySlug: vi.fn(),
      getTenantById: vi.fn(),
      getTenantByReferralCode: vi.fn(),
      createTenant: vi.fn(),
      createTenantSettings: vi.fn(),
      setTenantStripeCustomer: vi.fn(),
      setTenantReferrer: vi.fn(),
      createPendingTenantAdmin: vi.fn(),
      getUserByOpenId: vi.fn(),
      assignUserToTenantAsAdmin: vi.fn(),
      deleteUserById: vi.fn(),
    },
    createStripeCustomer: vi.fn(),
    buildConnectAuthorizeUrl: vi.fn(),
  }),
);

vi.mock("../db", () => dbMock);
vi.mock("../stripe", () => ({ createStripeCustomer }));
vi.mock("../stripeConnect", () => ({ buildConnectAuthorizeUrl }));

import { tenantRouter } from "./tenant";
import type { TrpcContext } from "../_core/context";

function ctx(
  user: { openId: string; role?: string; tenantId?: number } | null = null,
  tenant: { id: number; plan: string } | null = null,
): TrpcContext {
  return {
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
    user: (user as never) ?? null,
    tenant: (tenant as never) ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantBySlug.mockResolvedValue(undefined);
  dbMock.createTenant.mockResolvedValue(42);
  dbMock.createTenantSettings.mockResolvedValue(undefined);
  dbMock.setTenantStripeCustomer.mockResolvedValue(undefined);
  dbMock.createPendingTenantAdmin.mockResolvedValue(undefined);
  createStripeCustomer.mockResolvedValue(null);
});

describe("tenant.create", () => {
  it("provisions tenant, settings, and a pending admin, and returns a claim token", async () => {
    const res = await tenantRouter.createCaller(ctx()).create({
      name: "Aurora Atelier",
      slug: "aurora",
      email: "owner@aurora.example",
    });

    expect(dbMock.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "aurora",
        name: "Aurora Atelier",
        plan: "free",
      }),
    );
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith({
      tenantId: 42,
      currency: "chf",
    });
    expect(dbMock.createPendingTenantAdmin).toHaveBeenCalledWith(
      42,
      "owner@aurora.example",
      expect.any(String),
    );
    expect(res.tenantId).toBe(42);
    expect(res.slug).toBe("aurora");
    expect(res.claimToken).toEqual(expect.any(String));
    expect(res.claimToken.length).toBeGreaterThan(20);
    // The token is stored as `pending:<token>` in users.openId (varchar(64)),
    // so the whole thing must fit in 64 chars — guards the overflow that made
    // signup fail against a strict-mode MySQL.
    expect(`pending:${res.claimToken}`.length).toBeLessThanOrEqual(64);
    expect(dbMock.createPendingTenantAdmin).toHaveBeenCalledWith(
      42,
      "owner@aurora.example",
      res.claimToken,
    );
  });

  it("rejects a taken slug", async () => {
    dbMock.getTenantBySlug.mockResolvedValue({ id: 1, slug: "aurora" });
    await expect(
      tenantRouter.createCaller(ctx()).create({
        name: "Aurora",
        slug: "aurora",
        email: "o@a.example",
      }),
    ).rejects.toThrow(/already taken/i);
    expect(dbMock.createTenant).not.toHaveBeenCalled();
  });

  it("attaches a Stripe customer when Stripe is configured", async () => {
    createStripeCustomer.mockResolvedValue("cus_123");
    await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
    });
    expect(dbMock.setTenantStripeCustomer).toHaveBeenCalledWith(42, "cus_123");
  });

  it("skips the Stripe step when Stripe isn't configured", async () => {
    createStripeCustomer.mockResolvedValue(null);
    await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
    });
    expect(dbMock.setTenantStripeCustomer).not.toHaveBeenCalled();
  });

  it("credits a valid referrer", async () => {
    dbMock.getTenantByReferralCode.mockResolvedValue({ id: 7 });
    await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
      referralCode: "FRIEND7",
    });
    expect(dbMock.setTenantReferrer).toHaveBeenCalledWith(42, 7);
  });

  it("ignores an unknown referral code", async () => {
    dbMock.getTenantByReferralCode.mockResolvedValue(undefined);
    await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
      referralCode: "NOPE",
    });
    expect(dbMock.setTenantReferrer).not.toHaveBeenCalled();
  });
});

describe("tenant.claimAdmin", () => {
  it("links the signed-in user to the tenant and burns the pending row", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });

    const res = await tenantRouter
      .createCaller(ctx({ openId: "google:sub-1" }))
      .claimAdmin({ token: "tok-abc" });

    expect(dbMock.getUserByOpenId).toHaveBeenCalledWith("pending:tok-abc");
    expect(dbMock.assignUserToTenantAsAdmin).toHaveBeenCalledWith(
      "google:sub-1",
      42,
    );
    expect(dbMock.deleteUserById).toHaveBeenCalledWith(9);
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("rejects an unknown/used token", async () => {
    dbMock.getUserByOpenId.mockResolvedValue(undefined);
    await expect(
      tenantRouter
        .createCaller(ctx({ openId: "google:sub-1" }))
        .claimAdmin({ token: "bad" }),
    ).rejects.toThrow(/invalid or already-claimed/i);
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      tenantRouter.createCaller(ctx(null)).claimAdmin({ token: "tok" }),
    ).rejects.toThrow();
    expect(dbMock.getUserByOpenId).not.toHaveBeenCalled();
  });
});

describe("tenant.getStripeConnectUrl", () => {
  it("returns the authorize URL and connected:false for a not-yet-linked tenant", async () => {
    buildConnectAuthorizeUrl.mockResolvedValue(
      "https://connect.stripe.com/oauth/authorize?client_id=ca_test&state=signed",
    );
    dbMock.getTenantById.mockResolvedValue({
      id: 42,
      stripeConnectedAccountId: null,
    });
    const res = await tenantRouter
      .createCaller(
        ctx(
          { openId: "google:sub-1", role: "admin", tenantId: 42 },
          { id: 42, plan: "free" },
        ),
      )
      .getStripeConnectUrl();

    expect(buildConnectAuthorizeUrl).toHaveBeenCalledWith(
      42,
      expect.anything(),
    );
    expect(res).toEqual({
      url: "https://connect.stripe.com/oauth/authorize?client_id=ca_test&state=signed",
      connected: false,
    });
  });

  it("reports connected:true once a Stripe account is linked", async () => {
    buildConnectAuthorizeUrl.mockResolvedValue("https://connect.stripe.com/x");
    dbMock.getTenantById.mockResolvedValue({
      id: 42,
      stripeConnectedAccountId: "acct_already_linked",
    });
    const res = await tenantRouter
      .createCaller(
        ctx(
          { openId: "google:sub-1", role: "admin", tenantId: 42 },
          { id: 42, plan: "free" },
        ),
      )
      .getStripeConnectUrl();
    expect(res.connected).toBe(true);
  });

  it("returns a null url when Connect isn't configured on the platform", async () => {
    buildConnectAuthorizeUrl.mockResolvedValue(null);
    dbMock.getTenantById.mockResolvedValue({
      id: 42,
      stripeConnectedAccountId: null,
    });
    const res = await tenantRouter
      .createCaller(
        ctx(
          { openId: "google:sub-1", role: "admin", tenantId: 42 },
          { id: 42, plan: "free" },
        ),
      )
      .getStripeConnectUrl();
    expect(res).toEqual({ url: null, connected: false });
  });

  it("requires admin role", async () => {
    await expect(
      tenantRouter
        .createCaller(
          ctx(
            { openId: "google:sub-1", role: "user", tenantId: 42 },
            { id: 42, plan: "free" },
          ),
        )
        .getStripeConnectUrl(),
    ).rejects.toThrow();
    expect(buildConnectAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      tenantRouter.createCaller(ctx(null, { id: 42, plan: "free" })).getStripeConnectUrl(),
    ).rejects.toThrow();
    expect(buildConnectAuthorizeUrl).not.toHaveBeenCalled();
  });

  it("rejects when admin of different tenant", async () => {
    buildConnectAuthorizeUrl.mockResolvedValue("https://connect.stripe.com/x");
    dbMock.getTenantById.mockResolvedValue({
      id: 99,
      stripeConnectedAccountId: null,
    });
    await expect(
      tenantRouter
        .createCaller(
          ctx(
            { openId: "google:sub-1", role: "admin", tenantId: 42 },
            { id: 99, plan: "free" },
          ),
        )
        .getStripeConnectUrl(),
    ).rejects.toThrow();
    expect(buildConnectAuthorizeUrl).not.toHaveBeenCalled();
  });
});

describe("tenant.updateSettings plan gates", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };

  function tenantCtx(plan: string) {
    // Wire the settings row + update chain the procedure uses.
    dbMock.db.query = {
      tenantSettings: { findFirst: vi.fn().mockResolvedValue({ id: 9 }) },
    };
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    return {
      caller: tenantRouter.createCaller(ctx(admin, { id: 42, plan })),
      set,
    };
  }

  it("rejects a custom domain on the free plan", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(
      caller.updateSettings({ publicDomain: "shop.example.com" }),
    ).rejects.toThrow(/Pro plan/);
    expect(set).not.toHaveBeenCalled();
  });

  it("allows a custom domain on the Pro plan", async () => {
    const { caller, set } = tenantCtx("pro");
    await expect(
      caller.updateSettings({ publicDomain: "shop.example.com" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalled();
  });

  it("rejects multi-currency on the free plan", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(caller.updateSettings({ currency: "eur" })).rejects.toThrow(
      /Pro plan/,
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("allows multi-currency on the Pro plan", async () => {
    const { caller, set } = tenantCtx("pro");
    await expect(caller.updateSettings({ currency: "eur" })).resolves.toEqual({
      success: true,
    });
    expect(set).toHaveBeenCalled();
  });

  it("always allows CHF regardless of plan", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(caller.updateSettings({ currency: "chf" })).resolves.toEqual({
      success: true,
    });
    expect(set).toHaveBeenCalled();
  });

  it("still accepts ungated branding fields on the free plan", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(
      caller.updateSettings({ primaryColor: "#2D6B4A", metaTitle: "Hi" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalled();
  });

  it("rejects malformed domains", async () => {
    const { caller, set } = tenantCtx("pro");
    await expect(
      caller.updateSettings({ publicDomain: "https://shop.example.com/" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("tenant onboarding mutations", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };

  function cursorCtx(step: number) {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    return {
      caller: tenantRouter.createCaller(
        ctx(admin, { id: 42, plan: "free", onboardingStep: step } as never),
      ),
      set,
    };
  }

  it("dismissOnboarding stores -1", async () => {
    const { caller, set } = cursorCtx(0);
    await expect(caller.dismissOnboarding()).resolves.toEqual({
      success: true,
    });
    expect(set).toHaveBeenCalledWith({ onboardingStep: -1 });
  });

  it("setOnboardingCursor moves forward only", async () => {
    const { caller, set } = cursorCtx(1);
    await caller.setOnboardingCursor({ step: 2 });
    expect(set).toHaveBeenCalledWith({ onboardingStep: 2 });

    set.mockClear();
    await caller.setOnboardingCursor({ step: 1 }); // rewind ignored
    expect(set).not.toHaveBeenCalled();
  });

  it("setOnboardingCursor never rewinds a dismissed (-1) checklist", async () => {
    const { caller, set } = cursorCtx(-1);
    await caller.setOnboardingCursor({ step: 2 });
    expect(set).not.toHaveBeenCalled();
  });
});

describe("tenant.myStore", () => {
  it("requires an authenticated user", async () => {
    await expect(
      tenantRouter.createCaller(ctx(null)).myStore(),
    ).rejects.toThrow();
  });

  it("returns the signed-in user's store slug and name (host-independent)", async () => {
    dbMock.getTenantById.mockResolvedValue({
      id: 7,
      slug: "kalakosh",
      name: "Kalakosh",
      posApiKey: "hash",
    });
    const res = await tenantRouter
      .createCaller(ctx({ openId: "u1", role: "admin", tenantId: 7 }))
      .myStore();
    expect(dbMock.getTenantById).toHaveBeenCalledWith(7);
    expect(res).toEqual({ slug: "kalakosh", name: "Kalakosh" });
  });

  it("returns null when the user isn't attached to a store", async () => {
    const res = await tenantRouter
      .createCaller(ctx({ openId: "u1", role: "customer" }))
      .myStore();
    expect(res).toBeNull();
    expect(dbMock.getTenantById).not.toHaveBeenCalled();
  });
});
