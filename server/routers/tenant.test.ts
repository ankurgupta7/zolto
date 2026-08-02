import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data + stripe layers so the router is exercised in isolation.
// vi.hoisted lets the mock objects exist before the hoisted vi.mock factories run.
const { dbMock, createStripeCustomer, buildConnectAuthorizeUrl, storagePut } =
  vi.hoisted(() => ({
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
      getStoreUserByEmail: vi.fn(),
      getUserByOpenId: vi.fn(),
      assignUserToTenantAsAdmin: vi.fn(),
      deleteUserById: vi.fn(),
      seedTenantCategories: vi.fn(),
    },
    createStripeCustomer: vi.fn(),
    buildConnectAuthorizeUrl: vi.fn(),
    storagePut: vi.fn(),
  }));

vi.mock("../db", () => dbMock);
vi.mock("../stripe", () => ({ createStripeCustomer }));
vi.mock("../stripeConnect", () => ({ buildConnectAuthorizeUrl }));
vi.mock("../storage", () => ({ storagePut }));

const vaultMock = vi.hoisted(() => ({
  isTenantSecretsConfigured: vi.fn(() => true),
  listTenantSecrets: vi.fn(),
  setTenantSecret: vi.fn(),
  deleteTenantSecret: vi.fn(),
  startGatewayForToken: vi.fn(),
}));
vi.mock("../tenantSecrets", () => ({
  isTenantSecretsConfigured: vaultMock.isTenantSecretsConfigured,
  listTenantSecrets: vaultMock.listTenantSecrets,
  setTenantSecret: vaultMock.setTenantSecret,
  deleteTenantSecret: vaultMock.deleteTenantSecret,
}));
vi.mock("../discord", () => ({
  startGatewayForToken: vaultMock.startGatewayForToken,
}));

// brandingFromLogo dependencies: the per-IP limiter and the vision LLM. Both
// mocked so tests control the gate and the model's answer without a DB or
// network.
const brandingAiMock = vi.hoisted(() => ({
  rateLimitCheck: vi.fn(),
  invokeLLM: vi.fn(),
}));
vi.mock("../rateLimit", () => ({
  createRateLimiter: () => ({
    check: brandingAiMock.rateLimitCheck,
    reset: vi.fn(),
  }),
}));
vi.mock("../_core/llm", () => ({ invokeLLM: brandingAiMock.invokeLLM }));

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
  dbMock.getStoreUserByEmail.mockResolvedValue(undefined);
  dbMock.seedTenantCategories.mockResolvedValue(undefined);
  createStripeCustomer.mockResolvedValue(null);
  brandingAiMock.rateLimitCheck.mockResolvedValue({
    allowed: true,
    remaining: 9,
    retryAfterSeconds: 1,
  });
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
    // No vertical named → jewellery default, so pre-verticals signup clients
    // keep their original behaviour.
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith({
      tenantId: 42,
      currency: "chf",
      vertical: "jewellery",
      verticalDescription: null,
    });
    expect(dbMock.seedTenantCategories).toHaveBeenCalledWith(42, "jewellery");
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

  it("stores the chosen vertical and seeds its category preset", async () => {
    await tenantRouter.createCaller(ctx()).create({
      name: "Ton & Teller",
      slug: "ton-teller",
      email: "owner@ton.example",
      vertical: "ceramics",
      verticalDescription: "Wheel-thrown stoneware from Bern",
    });

    expect(dbMock.createTenantSettings).toHaveBeenCalledWith({
      tenantId: 42,
      currency: "chf",
      vertical: "ceramics",
      verticalDescription: "Wheel-thrown stoneware from Bern",
    });
    expect(dbMock.seedTenantCategories).toHaveBeenCalledWith(42, "ceramics");
  });

  it("rejects an unknown vertical", async () => {
    await expect(
      tenantRouter.createCaller(ctx()).create({
        name: "Threads",
        slug: "threads",
        email: "owner@threads.example",
        vertical: "clothing" as never,
      }),
    ).rejects.toThrow();
    expect(dbMock.createTenant).not.toHaveBeenCalled();
  });

  it("refuses an email already attached to another store", async () => {
    dbMock.getStoreUserByEmail.mockResolvedValue({ id: 5, tenantId: 7 });
    await expect(
      tenantRouter.createCaller(ctx()).create({
        name: "Second Store",
        slug: "second",
        email: "owner@aurora.example",
      }),
    ).rejects.toThrow(/already attached to a store/i);
    expect(dbMock.getStoreUserByEmail).toHaveBeenCalledWith(
      "owner@aurora.example",
    );
    // Nothing may be provisioned once the email is refused.
    expect(dbMock.createTenant).not.toHaveBeenCalled();
    expect(dbMock.createPendingTenantAdmin).not.toHaveBeenCalled();
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

describe("tenant.create — signup wizard branding", () => {
  const base = { name: "Aurora", slug: "aurora", email: "o@a.example" };

  it("seeds settings with the chosen template and color", async () => {
    await tenantRouter.createCaller(ctx()).create({
      ...base,
      templateId: "verdant",
      primaryColor: "#2F5D3A",
    });
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith({
      tenantId: 42,
      currency: "chf",
      templateId: "verdant",
      primaryColor: "#2F5D3A",
    });
  });

  it("uploads the logo tenant-scoped and stores its URL in the same settings row", async () => {
    storagePut.mockResolvedValue({
      key: "logos/42/logo_ab12.png",
      url: "/uploads/logos/42/logo_ab12.png",
    });
    const png = Buffer.from("fake-logo").toString("base64");
    const res = await tenantRouter.createCaller(ctx()).create({
      ...base,
      logo: { imageData: `data:image/png;base64,${png}`, mimeType: "image/png" },
    });

    const [tenantId, key, buffer, mime] = storagePut.mock.calls[0];
    // The leading tenantId is what makes storagePut enforce the storage cap.
    expect(tenantId).toBe(42);
    expect(String(key)).toMatch(/^logos\/42\//);
    expect((buffer as Buffer).toString()).toBe("fake-logo");
    expect(mime).toBe("image/png");
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: "/uploads/logos/42/logo_ab12.png" }),
    );
    expect(res.logoUrl).toBe("/uploads/logos/42/logo_ab12.png");
  });

  it("still creates the store when the logo upload fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    storagePut.mockRejectedValue(new Error("S3 down"));
    const res = await tenantRouter.createCaller(ctx()).create({
      ...base,
      templateId: "bazaar",
      logo: { imageData: "eA==", mimeType: "image/jpeg" },
    });
    expect(res.tenantId).toBe(42);
    expect(res.logoUrl).toBeNull();
    // Settings still land — template included, logoUrl simply absent.
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "bazaar" }),
    );
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.not.objectContaining({ logoUrl: expect.anything() }),
    );
    warn.mockRestore();
  });

  it("rejects an unknown template id", async () => {
    await expect(
      tenantRouter
        .createCaller(ctx())
        .create({ ...base, templateId: "brutalist" as never }),
    ).rejects.toThrow();
    expect(dbMock.createTenant).not.toHaveBeenCalled();
  });

  it("rejects a malformed color", async () => {
    await expect(
      tenantRouter
        .createCaller(ctx())
        .create({ ...base, primaryColor: "green" }),
    ).rejects.toThrow();
    expect(dbMock.createTenant).not.toHaveBeenCalled();
  });

  it("rejects a non-image logo mime type", async () => {
    await expect(
      tenantRouter.createCaller(ctx()).create({
        ...base,
        logo: { imageData: "eA==", mimeType: "image/svg+xml" as never },
      }),
    ).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });
});

describe("tenant.brandingFromLogo", () => {
  const dataUrl = `data:image/png;base64,${Buffer.from("logo").toString("base64")}`;

  function aiAnswer(payload: unknown) {
    brandingAiMock.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    });
  }

  it("returns the extracted scheme and template suggestion", async () => {
    aiAnswer({
      primaryColor: "#2F5D3A",
      secondaryColor: "#B8963E",
      suggestedTemplateId: "verdant",
      rationale: "Forest green with a gold accent.",
    });
    const res = await tenantRouter
      .createCaller(ctx())
      .brandingFromLogo({ imageData: dataUrl });
    expect(res).toEqual({
      primaryColor: "#2F5D3A",
      secondaryColor: "#B8963E",
      suggestedTemplateId: "verdant",
      rationale: "Forest green with a gold accent.",
    });
    // The logo pixels must actually reach the model.
    const call = brandingAiMock.invokeLLM.mock.calls[0][0];
    expect(JSON.stringify(call.messages)).toContain(dataUrl);
  });

  it("nulls out a non-hex secondary color and an unknown template suggestion", async () => {
    aiAnswer({
      primaryColor: "#1F2933",
      secondaryColor: "none",
      suggestedTemplateId: "brutalist",
      rationale: "Cool charcoal.",
    });
    const res = await tenantRouter
      .createCaller(ctx())
      .brandingFromLogo({ imageData: dataUrl });
    expect(res.primaryColor).toBe("#1F2933");
    expect(res.secondaryColor).toBeNull();
    expect(res.suggestedTemplateId).toBeNull();
  });

  it("fails clearly when the AI can't produce a usable primary color", async () => {
    aiAnswer({
      primaryColor: "sort of teal",
      secondaryColor: "#FFFFFF",
      suggestedTemplateId: "azure",
      rationale: "…",
    });
    await expect(
      tenantRouter.createCaller(ctx()).brandingFromLogo({ imageData: dataUrl }),
    ).rejects.toThrow(/pick one manually/i);
  });

  it("refuses when the per-IP rate limit is exhausted, without spending tokens", async () => {
    brandingAiMock.rateLimitCheck.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 120,
    });
    await expect(
      tenantRouter.createCaller(ctx()).brandingFromLogo({ imageData: dataUrl }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(brandingAiMock.invokeLLM).not.toHaveBeenCalled();
  });

  it("rejects anything that isn't an image data URL", async () => {
    await expect(
      tenantRouter
        .createCaller(ctx())
        .brandingFromLogo({ imageData: "https://evil.example/logo.png" }),
    ).rejects.toThrow();
    expect(brandingAiMock.invokeLLM).not.toHaveBeenCalled();
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

  it("refuses an account that already manages a different store", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    await expect(
      tenantRouter
        .createCaller(ctx({ openId: "google:sub-1", tenantId: 7 }))
        .claimAdmin({ token: "tok-abc" }),
    ).rejects.toThrow(/already manages a store/i);
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
    // The pending row survives, so the rightful owner can still claim.
    expect(dbMock.deleteUserById).not.toHaveBeenCalled();
  });

  it("still claims when the account is already on the SAME store", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });
    const res = await tenantRouter
      .createCaller(ctx({ openId: "google:sub-1", tenantId: 42 }))
      .claimAdmin({ token: "tok-abc" });
    expect(dbMock.assignUserToTenantAsAdmin).toHaveBeenCalledWith(
      "google:sub-1",
      42,
    );
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

  it("logs the tenant mismatch, because the merchant-facing symptom is identical to 'not configured'", async () => {
    // Both cases leave the client without a URL, so without this log there is
    // no way to tell a cross-tenant session from a missing env var.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      tenantRouter
        .createCaller(
          ctx(
            { openId: "google:sub-1", role: "admin", tenantId: 7 },
            { id: 42, plan: "free", slug: "blah1" },
          ),
        )
        .getStripeConnectUrl(),
    ).rejects.toThrow();

    const text = String(spy.mock.calls[0]?.[0] ?? "");
    expect(text).toContain("tenant 7");
    expect(text).toContain("tenant 42");
    expect(text).toContain("blah1");
    spy.mockRestore();
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
      tenantRouter
        .createCaller(ctx(null, { id: 42, plan: "free" }))
        .getStripeConnectUrl(),
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

  it("accepts a template change on every plan, and rejects unknown template ids", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(
      caller.updateSettings({ templateId: "porcelain" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: "porcelain" }),
    );
    set.mockClear();
    await expect(
      caller.updateSettings({ templateId: "brutalist" as never }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});

// Regression: updateSettings was `publicProcedure.use(requireTenant)` despite
// its "Admin" heading, so ANY unauthenticated caller who could reach a store's
// host could rewrite that store's settings — contact email, Discord intake
// channel, public domain, branding. These pin the guard shut.
describe("tenant.updateSettings authorization", () => {
  function settingsCtx(
    user: { openId: string; role?: string; tenantId?: number } | null,
    tenantId = 42,
  ) {
    dbMock.db.query = {
      tenantSettings: { findFirst: vi.fn().mockResolvedValue({ id: 9 }) },
    };
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    return {
      caller: tenantRouter.createCaller(
        ctx(user, { id: tenantId, plan: "free" }),
      ),
      set,
    };
  }

  it("refuses an anonymous caller", async () => {
    const { caller, set } = settingsCtx(null);
    await expect(
      caller.updateSettings({ contactEmail: "attacker@evil.test" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin", async () => {
    const { caller, set } = settingsCtx({
      openId: "google:shopper",
      role: "user",
      tenantId: 42,
    });
    await expect(
      caller.updateSettings({ contactEmail: "attacker@evil.test" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses an admin of a DIFFERENT store", async () => {
    // The cross-tenant case: a real admin, but of tenant 7, addressing 42.
    // Redirecting another store's Discord intake channel would be enough to
    // steal their product feed.
    const { caller, set } = settingsCtx(
      { openId: "google:other", role: "admin", tenantId: 7 },
      42,
    );
    await expect(
      caller.updateSettings({ discordChannelId: "12345678901234567" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("allows this store's own admin", async () => {
    const { caller, set } = settingsCtx({
      openId: "google:admin",
      role: "admin",
      tenantId: 42,
    });
    await expect(
      caller.updateSettings({ metaTitle: "Aurora" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalled();
  });

  it("allows a superadmin acting across tenants", async () => {
    // Platform support must still be able to act on a store it doesn't belong
    // to; that exemption is deliberate, so pin it rather than leave it to luck.
    const { caller, set } = settingsCtx(
      { openId: "google:root", role: "superadmin", tenantId: 1 },
      42,
    );
    await expect(
      caller.updateSettings({ metaTitle: "Fixed by support" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalled();
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

  // Both were `publicProcedure` — unauthenticated writes to the tenants row,
  // the same class of bug as updateSettings, just far lower impact.
  it("refuses an anonymous caller on both mutations", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    const caller = tenantRouter.createCaller(
      ctx(null, { id: 42, plan: "free", onboardingStep: 0 } as never),
    );
    await expect(caller.dismissOnboarding()).rejects.toThrow();
    await expect(caller.setOnboardingCursor({ step: 2 })).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses an admin of a different store", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    const caller = tenantRouter.createCaller(
      ctx({ openId: "google:other", role: "admin", tenantId: 7 }, {
        id: 42,
        plan: "free",
        onboardingStep: 0,
      } as never),
    );
    await expect(caller.dismissOnboarding()).rejects.toThrow();
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

describe("tenant.setTwintQr", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };

  function qrCtx(user: typeof admin | null = admin, tenantId = 42) {
    dbMock.db.query = {
      tenantSettings: { findFirst: vi.fn().mockResolvedValue({ id: 9 }) },
    };
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    dbMock.db.update = vi.fn(() => ({ set }));
    return {
      caller: tenantRouter.createCaller(
        ctx(user, { id: tenantId, plan: "free" }),
      ),
      set,
    };
  }

  beforeEach(() => {
    storagePut.mockResolvedValue({
      key: "twint-qr/42/1_ab12.png",
      url: "/uploads/twint-qr/42/1_ab12.png",
    });
  });

  it("stores the image against the tenant so it counts toward the storage cap", async () => {
    const { caller, set } = qrCtx();
    const png = Buffer.from("fake-png").toString("base64");
    await expect(
      caller.setTwintQr({ imageData: `data:image/png;base64,${png}` }),
    ).resolves.toEqual({ twintQrUrl: "/uploads/twint-qr/42/1_ab12.png" });

    const [tenantId, key, buffer, mime] = storagePut.mock.calls[0];
    // The leading tenantId is what makes storagePut enforce PLANS[].storageGb.
    expect(tenantId).toBe(42);
    expect(String(key)).toMatch(/^twint-qr\/42\//);
    expect((buffer as Buffer).toString()).toBe("fake-png");
    expect(mime).toBe("image/png");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        twintQrUrl: "/uploads/twint-qr/42/1_ab12.png",
      }),
    );
  });

  it("clears the sticker without touching storage when passed null", async () => {
    const { caller, set } = qrCtx();
    await expect(caller.setTwintQr({ imageData: null })).resolves.toEqual({
      twintQrUrl: null,
    });
    expect(storagePut).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ twintQrUrl: null }),
    );
  });

  it("rejects empty image data rather than storing a zero-byte file", async () => {
    const { caller } = qrCtx();
    await expect(caller.setTwintQr({ imageData: "" })).rejects.toThrow(
      /didn't contain any image data/,
    );
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects a non-image mime type", async () => {
    const { caller } = qrCtx();
    await expect(
      caller.setTwintQr({
        imageData: "eA==",
        mimeType: "application/pdf" as never,
      }),
    ).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    const { caller } = qrCtx(null);
    await expect(caller.setTwintQr({ imageData: "eA==" })).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("refuses an admin of a different store", async () => {
    const { caller } = qrCtx(
      { openId: "google:other", role: "admin", tenantId: 7 },
      42,
    );
    await expect(caller.setTwintQr({ imageData: "eA==" })).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });
});

describe("tenant channel-credential vault procedures", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };

  function caller(user: typeof admin | null = admin, tenantId = 42) {
    return tenantRouter.createCaller(ctx(user, { id: tenantId, plan: "free" }));
  }

  beforeEach(() => {
    vaultMock.isTenantSecretsConfigured.mockReturnValue(true);
    vaultMock.listTenantSecrets.mockResolvedValue([]);
    vaultMock.setTenantSecret.mockResolvedValue(undefined);
    vaultMock.deleteTenantSecret.mockResolvedValue(undefined);
  });

  it("stores a credential against the caller's own store", async () => {
    const res = await caller().setChannelSecret({
      provider: "slack_bot_token",
      value: "xoxb-1234567890",
    });
    expect(vaultMock.setTenantSecret).toHaveBeenCalledWith(
      42,
      "slack_bot_token",
      "xoxb-1234567890",
    );
    // Write-only contract: the response carries the hint, never the value.
    expect(res).toEqual({ provider: "slack_bot_token", hint: "7890" });
  });

  it("connects a freshly pasted Discord bot token immediately", async () => {
    await caller().setChannelSecret({
      provider: "discord_bot_token",
      value: "discord-token-abcd",
    });
    expect(vaultMock.startGatewayForToken).toHaveBeenCalledWith(
      "discord-token-abcd",
    );
  });

  it("does not touch the Discord gateway for non-Discord credentials", async () => {
    await caller().setChannelSecret({
      provider: "whatsapp_token",
      value: "EAAG-longtoken",
    });
    expect(vaultMock.startGatewayForToken).not.toHaveBeenCalled();
  });

  it("lists masked hints only — never a secret value", async () => {
    vaultMock.listTenantSecrets.mockResolvedValue([
      {
        provider: "slack_bot_token",
        hint: "7890",
        keyVersion: 1,
        createdAt: new Date("2026-07-01"),
        rotatedAt: null,
        lastUsedAt: null,
      },
      // Unknown providers (e.g. a future "stripe" secret) stay out of this
      // channel-scoped listing.
      {
        provider: "some_other_secret",
        hint: "zzzz",
        keyVersion: 1,
        createdAt: new Date("2026-07-01"),
        rotatedAt: null,
        lastUsedAt: null,
      },
    ]);
    const res = await caller().channelSecrets();
    expect(res.vaultConfigured).toBe(true);
    expect(res.secrets).toHaveLength(1);
    expect(res.secrets[0]).toMatchObject({
      provider: "slack_bot_token",
      hint: "7890",
    });
    expect(JSON.stringify(res)).not.toContain("xoxb");
  });

  it("refuses to store when the vault has no master key", async () => {
    vaultMock.isTenantSecretsConfigured.mockReturnValue(false);
    await expect(
      caller().setChannelSecret({
        provider: "slack_bot_token",
        value: "xoxb-1234567890",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(vaultMock.setTenantSecret).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider name", async () => {
    await expect(
      caller().setChannelSecret({
        provider: "stripe_secret_key" as never,
        value: "sk_live_oops",
      }),
    ).rejects.toThrow();
    expect(vaultMock.setTenantSecret).not.toHaveBeenCalled();
  });

  it("deletes a credential for the caller's own store", async () => {
    await caller().deleteChannelSecret({ provider: "whatsapp_app_secret" });
    expect(vaultMock.deleteTenantSecret).toHaveBeenCalledWith(
      42,
      "whatsapp_app_secret",
    );
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      caller(null).setChannelSecret({
        provider: "slack_bot_token",
        value: "xoxb-1234567890",
      }),
    ).rejects.toThrow();
    expect(vaultMock.setTenantSecret).not.toHaveBeenCalled();
  });

  // The cross-tenant case is the one that silently regresses (CLAUDE.md):
  // an admin of store 7 addressing store 42's host must be refused.
  it("refuses an admin of a different store, for every procedure", async () => {
    const other = { openId: "google:other", role: "admin", tenantId: 7 };
    await expect(caller(other, 42).channelSecrets()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller(other, 42).setChannelSecret({
        provider: "slack_bot_token",
        value: "xoxb-1234567890",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(other, 42).deleteChannelSecret({ provider: "slack_bot_token" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // channelConnect only returns URLs, but the Slack one embeds a signed
    // state naming the addressed tenant — refusing cross-tenant here is what
    // stops an admin of store 7 minting a connect link that binds store 42.
    await expect(caller(other, 42).channelConnect()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vaultMock.setTenantSecret).not.toHaveBeenCalled();
    expect(vaultMock.deleteTenantSecret).not.toHaveBeenCalled();
    expect(vaultMock.listTenantSecrets).not.toHaveBeenCalled();
  });
});
