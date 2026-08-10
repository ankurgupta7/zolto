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
      getPendingTenantAdminByEmail: vi.fn(),
      getUserByOpenId: vi.fn(),
      assignUserToTenantAsAdmin: vi.fn(),
      deleteUserById: vi.fn(),
      seedTenantCategories: vi.fn(),
      getTenantSettingsByDomain: vi.fn(),
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

// The durable claim-link email sent at signup (step 8 of tenant.create).
const sendClaimLinkEmail = vi.hoisted(() => vi.fn());
vi.mock("../_core/email", () => ({ sendClaimLinkEmail }));

import { tenantRouter } from "./tenant";
import type { TrpcContext } from "../_core/context";

function ctx(
  user: {
    openId: string;
    role?: string;
    tenantId?: number;
    email?: string;
  } | null = null,
  tenant: {
    id: number;
    plan: string;
    compPlan?: string | null;
    compFeeWaived?: boolean;
    compNote?: string | null;
    posApiKey?: string;
  } | null = null,
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
  dbMock.getPendingTenantAdminByEmail.mockResolvedValue(undefined);
  dbMock.seedTenantCategories.mockResolvedValue(undefined);
  dbMock.getTenantSettingsByDomain.mockResolvedValue(undefined);
  sendClaimLinkEmail.mockResolvedValue(false);
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

  it("emails a durable claim link carrying the token and store", async () => {
    // The sessionStorage token dies with the signup tab; the emailed link is
    // what survives a failed sign-in or a second device — and it covers the
    // one case resumeClaim can't: signing in with a different address than
    // the one typed at signup.
    sendClaimLinkEmail.mockResolvedValue(true);
    const res = await tenantRouter.createCaller(ctx()).create({
      name: "Aurora Atelier",
      slug: "aurora",
      email: "owner@aurora.example",
    });
    expect(sendClaimLinkEmail).toHaveBeenCalledWith({
      to: "owner@aurora.example",
      storeName: "Aurora Atelier",
      url: expect.stringContaining("/onboarding?store=aurora&claim="),
    });
    const { url } = sendClaimLinkEmail.mock.calls[0][0];
    expect(url).toContain(`claim=${res.claimToken}`);
    expect(res.claimEmailSent).toBe(true);
  });

  it("still creates the store when the claim email fails to send", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendClaimLinkEmail.mockRejectedValue(new Error("Resend down"));
    const res = await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
    });
    expect(res.tenantId).toBe(42);
    expect(res.claimEmailSent).toBe(false);
    // The in-browser token still works, so the signup must not be lost.
    expect(res.claimToken).toEqual(expect.any(String));
    warn.mockRestore();
  });

  it("reports claimEmailSent:false when mail isn't configured", async () => {
    sendClaimLinkEmail.mockResolvedValue(false);
    const res = await tenantRouter.createCaller(ctx()).create({
      name: "Aurora",
      slug: "aurora",
      email: "o@a.example",
    });
    expect(res.claimEmailSent).toBe(false);
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

  it("stores where the merchant is migrating from", async () => {
    await tenantRouter.createCaller(ctx()).create({
      name: "Ton & Teller",
      slug: "ton-teller",
      email: "owner@ton.example",
      migrateFrom: "sumup",
    });
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({ migrateFrom: "sumup" }),
    );
  });

  it("rejects an unknown migration source", async () => {
    await expect(
      tenantRouter.createCaller(ctx()).create({
        name: "Threads",
        slug: "threads",
        email: "owner@threads.example",
        migrateFrom: "square" as never,
      }),
    ).rejects.toThrow();
    expect(dbMock.createTenant).not.toHaveBeenCalled();
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
    dbMock.getStoreUserByEmail.mockResolvedValue({
      id: 5,
      tenantId: 7,
      pendingClaim: false,
    });
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

  it("points a half-finished signup at the recovery path, not a dead end", async () => {
    // The catch-22 this message used to create: sign-in failed after signup,
    // the merchant retries signup, and "already attached" reads as unfixable.
    // A pending (unclaimed) row must instead say how to resume.
    dbMock.getStoreUserByEmail.mockResolvedValue({
      id: 5,
      tenantId: 7,
      pendingClaim: true,
    });
    await expect(
      tenantRouter.createCaller(ctx()).create({
        name: "Second Try",
        slug: "second-try",
        email: "owner@aurora.example",
      }),
    ).rejects.toThrow(/finish setting it up/i);
    expect(dbMock.createTenant).not.toHaveBeenCalled();
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

  it("seeds settings with the chosen template and BOTH brand colors", async () => {
    await tenantRouter.createCaller(ctx()).create({
      ...base,
      templateId: "verdant",
      primaryColor: "#2F5D3A",
      secondaryColor: "#C08A2E",
    });
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith({
      tenantId: 42,
      currency: "chf",
      // No vertical named → the jewellery default rides along.
      vertical: "jewellery",
      verticalDescription: null,
      templateId: "verdant",
      primaryColor: "#2F5D3A",
      secondaryColor: "#C08A2E",
    });
  });

  it("omits the secondary rather than storing a placeholder when none is sent", async () => {
    await tenantRouter
      .createCaller(ctx())
      .create({ ...base, primaryColor: "#2F5D3A" });
    // Null/absent means "derive the accent from the primary" — the behaviour
    // every store predating the second color relies on.
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.not.objectContaining({ secondaryColor: expect.anything() }),
    );
  });

  it("rejects a malformed secondary color", async () => {
    await expect(
      tenantRouter
        .createCaller(ctx())
        .create({ ...base, secondaryColor: "gold" }),
    ).rejects.toThrow();
    expect(dbMock.createTenant).not.toHaveBeenCalled();
  });

  it("uploads the logo tenant-scoped and stores its URL in the same settings row", async () => {
    storagePut.mockResolvedValue({
      key: "logos/42/logo_ab12.png",
      url: "/uploads/logos/42/logo_ab12.png",
    });
    const png = Buffer.from("fake-logo").toString("base64");
    const res = await tenantRouter.createCaller(ctx()).create({
      ...base,
      logo: {
        imageData: `data:image/png;base64,${png}`,
        mimeType: "image/png",
      },
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

  it("returns the extracted two-color scheme and template suggestion", async () => {
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

  // An accent identical to the ink is invisible: dividers and labels vanish
  // into the footer. Null instead, so the client derives a visible tint.
  it("nulls out a secondary that merely echoes the primary", async () => {
    aiAnswer({
      primaryColor: "#2F5D3A",
      secondaryColor: "#2f5d3a",
      suggestedTemplateId: "verdant",
      rationale: "Green.",
    });
    const res = await tenantRouter
      .createCaller(ctx())
      .brandingFromLogo({ imageData: dataUrl });
    expect(res.primaryColor).toBe("#2F5D3A");
    expect(res.secondaryColor).toBeNull();
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
        .createCaller(
          ctx({ openId: "google:sub-1", role: "admin", tenantId: 7 }),
        )
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

  // THE production regression: users.tenantId is NOT NULL and upsertUser parks
  // every fresh sign-in (Google, Apple, magic link) on DEFAULT_TENANT_ID with
  // role `customer`. Treating that parked tenantId as "already manages a
  // store" made claiming impossible for exactly the person signup told to
  // sign in — the first real merchant could create a store and then never
  // become its admin.
  it("claims for a fresh sign-in parked on the platform tenant as customer", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });
    const res = await tenantRouter
      .createCaller(
        ctx({
          openId: "email:owner@aurora.example",
          role: "customer",
          tenantId: 1,
        }),
      )
      .claimAdmin({ token: "tok-abc" });
    expect(dbMock.assignUserToTenantAsAdmin).toHaveBeenCalledWith(
      "email:owner@aurora.example",
      42,
    );
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("claims for a customer of some other store — shoppers aren't store owners", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });
    const res = await tenantRouter
      .createCaller(
        ctx({ openId: "google:sub-1", role: "customer", tenantId: 7 }),
      )
      .claimAdmin({ token: "tok-abc" });
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("still refuses staff of a different store", async () => {
    dbMock.getUserByOpenId.mockResolvedValue({
      id: 9,
      tenantId: 42,
      role: "admin",
    });
    await expect(
      tenantRouter
        .createCaller(
          ctx({ openId: "google:sub-1", role: "staff", tenantId: 7 }),
        )
        .claimAdmin({ token: "tok-abc" }),
    ).rejects.toThrow(/already manages a store/i);
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
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

// The recovery pair for the lost-token catch-22: the claim token lives only in
// the signup tab's sessionStorage, so a failed sign-in, closed tab, or second
// device strands a created-but-unclaimed store. These procedures find it again
// by the signed-in account's provider-verified email.
describe("tenant.pendingClaim", () => {
  it("returns the waiting store for a matching email", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    dbMock.getTenantById.mockResolvedValue({
      id: 42,
      slug: "aurora",
      name: "Aurora Atelier",
    });
    const res = await tenantRouter
      .createCaller(
        ctx({ openId: "google:sub-1", email: "owner@aurora.example" }),
      )
      .pendingClaim();
    expect(dbMock.getPendingTenantAdminByEmail).toHaveBeenCalledWith(
      "owner@aurora.example",
    );
    expect(res).toEqual({ slug: "aurora", name: "Aurora Atelier" });
  });

  it("returns null when nothing is waiting for this email", async () => {
    const res = await tenantRouter
      .createCaller(ctx({ openId: "google:sub-1", email: "new@a.example" }))
      .pendingClaim();
    expect(res).toBeNull();
  });

  it("returns null for an account that already manages a store, without looking up", async () => {
    const res = await tenantRouter
      .createCaller(
        ctx({
          openId: "google:sub-1",
          role: "admin",
          tenantId: 7,
          email: "owner@a.example",
        }),
      )
      .pendingClaim();
    expect(res).toBeNull();
    expect(dbMock.getPendingTenantAdminByEmail).not.toHaveBeenCalled();
  });

  // The production regression: every fresh sign-in is parked on
  // DEFAULT_TENANT_ID as a customer, and this lookup bailing on that parked
  // tenantId is what hid the recovery card from the stranded merchant.
  it("still finds the waiting store for a sign-in parked on the platform tenant", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    dbMock.getTenantById.mockResolvedValue({
      id: 42,
      slug: "aurora",
      name: "Aurora Atelier",
    });
    const res = await tenantRouter
      .createCaller(
        ctx({
          openId: "email:owner@aurora.example",
          role: "customer",
          tenantId: 1,
          email: "owner@aurora.example",
        }),
      )
      .pendingClaim();
    expect(res).toEqual({ slug: "aurora", name: "Aurora Atelier" });
  });

  it("returns null for an account with no email on file", async () => {
    const res = await tenantRouter
      .createCaller(ctx({ openId: "google:sub-1" }))
      .pendingClaim();
    expect(res).toBeNull();
    expect(dbMock.getPendingTenantAdminByEmail).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    await expect(
      tenantRouter.createCaller(ctx(null)).pendingClaim(),
    ).rejects.toThrow();
    expect(dbMock.getPendingTenantAdminByEmail).not.toHaveBeenCalled();
  });
});

describe("tenant.resumeClaim", () => {
  it("claims the waiting store by email match and burns the pending row", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });

    const res = await tenantRouter
      .createCaller(
        ctx({ openId: "google:sub-1", email: "owner@aurora.example" }),
      )
      .resumeClaim();

    expect(dbMock.getPendingTenantAdminByEmail).toHaveBeenCalledWith(
      "owner@aurora.example",
    );
    expect(dbMock.assignUserToTenantAsAdmin).toHaveBeenCalledWith(
      "google:sub-1",
      42,
    );
    expect(dbMock.deleteUserById).toHaveBeenCalledWith(9);
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("rejects when no unclaimed store matches this email", async () => {
    await expect(
      tenantRouter
        .createCaller(ctx({ openId: "google:sub-1", email: "new@a.example" }))
        .resumeClaim(),
    ).rejects.toThrow(/no unclaimed store/i);
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
  });

  it("rejects an account with no email on file, without a lookup", async () => {
    await expect(
      tenantRouter.createCaller(ctx({ openId: "google:sub-1" })).resumeClaim(),
    ).rejects.toThrow(/no unclaimed store/i);
    expect(dbMock.getPendingTenantAdminByEmail).not.toHaveBeenCalled();
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
  });

  it("refuses an account that already manages a different store", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    await expect(
      tenantRouter
        .createCaller(
          ctx({
            openId: "google:sub-1",
            role: "admin",
            tenantId: 7,
            email: "o@a.example",
          }),
        )
        .resumeClaim(),
    ).rejects.toThrow(/already manages a store/i);
    expect(dbMock.assignUserToTenantAsAdmin).not.toHaveBeenCalled();
    // The pending row survives, so the rightful owner can still claim.
    expect(dbMock.deleteUserById).not.toHaveBeenCalled();
  });

  // The production regression, resume flavor: the parked customer row is the
  // one doing the resuming, and it must be promoted, not refused.
  it("resumes for a fresh sign-in parked on the platform tenant as customer", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });
    const res = await tenantRouter
      .createCaller(
        ctx({
          openId: "email:owner@aurora.example",
          role: "customer",
          tenantId: 1,
          email: "owner@aurora.example",
        }),
      )
      .resumeClaim();
    expect(dbMock.assignUserToTenantAsAdmin).toHaveBeenCalledWith(
      "email:owner@aurora.example",
      42,
    );
    expect(dbMock.deleteUserById).toHaveBeenCalledWith(9);
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("still claims when the account is already on the SAME store", async () => {
    dbMock.getPendingTenantAdminByEmail.mockResolvedValue({
      id: 9,
      tenantId: 42,
    });
    dbMock.getTenantById.mockResolvedValue({ id: 42, slug: "aurora" });
    const res = await tenantRouter
      .createCaller(
        ctx({ openId: "google:sub-1", tenantId: 42, email: "o@a.example" }),
      )
      .resumeClaim();
    expect(res).toEqual({ tenantId: 42, slug: "aurora" });
  });

  it("requires authentication", async () => {
    await expect(
      tenantRouter.createCaller(ctx(null)).resumeClaim(),
    ).rejects.toThrow();
    expect(dbMock.getPendingTenantAdminByEmail).not.toHaveBeenCalled();
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

  it("accepts a secondary color on every plan and rejects a malformed one", async () => {
    const { caller, set } = tenantCtx("free");
    await expect(
      caller.updateSettings({ secondaryColor: "#B8963E" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ secondaryColor: "#B8963E" }),
    );
    set.mockClear();
    await expect(
      caller.updateSettings({ secondaryColor: "gold" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  // One domain, one store: the hostname now decides which store a request is
  // served as (server/tenantResolve.ts), so letting two stores register the
  // same one means whoever's row comes back first serves the other's traffic.
  it("refuses a domain another store has already connected", async () => {
    const { caller, set } = tenantCtx("pro");
    dbMock.getTenantSettingsByDomain.mockResolvedValue({
      id: 3,
      tenantId: 7,
      publicDomain: "shop.example.com",
    });
    await expect(
      caller.updateSettings({ publicDomain: "shop.example.com" }),
    ).rejects.toThrow(/already connected to another store/);
    expect(set).not.toHaveBeenCalled();
  });

  it("lets a store re-save the domain it already owns", async () => {
    const { caller, set } = tenantCtx("pro");
    dbMock.getTenantSettingsByDomain.mockResolvedValue({
      id: 9,
      tenantId: 42,
      publicDomain: "shop.example.com",
    });
    await expect(
      caller.updateSettings({ publicDomain: "shop.example.com" }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalled();
  });

  it("does not spend a domain lookup when no domain is being set", async () => {
    const { caller } = tenantCtx("pro");
    await caller.updateSettings({ metaTitle: "Aurora" });
    expect(dbMock.getTenantSettingsByDomain).not.toHaveBeenCalled();
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
// The client gates (Domain, Support, Billing) all read `plan` off this
// response, so what it means is a contract and not an implementation detail.
describe("tenant.me — the plan the admin UI gates on", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };
  const base = { id: 42, posApiKey: "hashed-secret" };

  it("reports the paid plan for an ordinary store", async () => {
    const me = await tenantRouter
      .createCaller(ctx(admin, { ...base, plan: "free" }))
      .me();
    expect(me.plan).toBe("free");
    expect(me.comped).toBe(false);
  });

  it("reports the comped plan, with the paid one still visible", async () => {
    const me = await tenantRouter
      .createCaller(ctx(admin, { ...base, plan: "free", compPlan: "pro" }))
      .me();
    expect(me.plan).toBe("pro"); // what the gates read
    expect(me.paidPlan).toBe("free"); // what Stripe bills
    expect(me.planComped).toBe(true);
    expect(me.onlineFeeBps).toBe(0);
  });

  it("reports a waived fee without inventing a plan grant", async () => {
    const me = await tenantRouter
      .createCaller(ctx(admin, { ...base, plan: "free", compFeeWaived: true }))
      .me();
    expect(me.plan).toBe("free");
    expect(me.onlineFeeBps).toBe(0);
    expect(me.planComped).toBe(false);
  });

  it("never returns the POS key hash, nor the operator's private note", async () => {
    const me = await tenantRouter
      .createCaller(
        ctx(admin, {
          ...base,
          plan: "free",
          compPlan: "pro",
          compNote: "friend of the founder",
        }),
      )
      .me();
    expect(me).not.toHaveProperty("posApiKey");
    expect(me).not.toHaveProperty("compNote");
    expect(JSON.stringify(me)).not.toContain("founder");
  });
});

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

describe("tenant.updateSettings merchant-authored content", () => {
  const admin = { openId: "google:admin", role: "admin", tenantId: 42 };

  // `existing: null` is the store that has no tenant_settings row yet — the
  // insert branch. Not `undefined`, which would re-trigger the default.
  function settingsCtx(
    user: Record<string, unknown> | null = admin,
    tenantId = 42,
    existing: unknown = { id: 9 },
  ) {
    dbMock.db.query = {
      tenantSettings: { findFirst: vi.fn().mockResolvedValue(existing) },
    };
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.db.update = vi.fn(() => ({ set }));
    dbMock.db.insert = vi.fn(() => ({ values }));
    return {
      caller: tenantRouter.createCaller(
        ctx(user, { id: tenantId, plan: "free" }),
      ),
      set,
      values,
    };
  }

  it("stores the hero, About and legal fields on every plan", async () => {
    // None of this is plan-gated: a store's own words are not a paid feature,
    // and an imprint is a legal obligation rather than an upsell.
    const { caller, set } = settingsCtx();
    await expect(
      caller.updateSettings({
        heroImageUrl: "https://cdn.example/shopfront.jpg",
        heroHeadline: "Made by hand",
        heroSubtitle: "In the old town since 2018",
        aboutBody: "We opened with one kiln.",
        whiteLabelName: "Aurora Atelier",
        companyLegalName: "Aurora Atelier GmbH",
        companyAddress: "Musterstrasse 1\n8001 Basel",
        vatNumber: "CHE-123.456.789 MWST",
        companyRegistration: "CH-020.3.001.234-5",
      }),
    ).resolves.toEqual({ success: true });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        heroHeadline: "Made by hand",
        aboutBody: "We opened with one kiln.",
        whiteLabelName: "Aurora Atelier",
        companyAddress: "Musterstrasse 1\n8001 Basel",
        vatNumber: "CHE-123.456.789 MWST",
      }),
    );
  });

  // The whole point of `.nullable()` on these fields: a merchant must be able
  // to delete what they wrote and get the generated copy back. With
  // `.optional()` alone — as the older branding fields still are — clearing a
  // box would be indistinguishable from not touching it.
  it("clears a field back to null", async () => {
    const { caller, set } = settingsCtx();
    await caller.updateSettings({ heroHeadline: null, aboutBody: null });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ heroHeadline: null, aboutBody: null }),
    );
  });

  it("normalises an emptied box to null rather than a blank string", async () => {
    // "" would read as "written, but empty" downstream — and would fool the
    // imprint into dropping its "add your legal details" note while showing
    // no details at all.
    const { caller, set } = settingsCtx();
    await caller.updateSettings({
      heroHeadline: "   ",
      companyAddress: "",
      vatNumber: "",
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        heroHeadline: null,
        companyAddress: null,
        vatNumber: null,
      }),
    );
  });

  it("leaves untouched fields out of the update entirely", async () => {
    const { caller, set } = settingsCtx();
    await caller.updateSettings({ heroHeadline: "Made by hand" });
    const patch = set.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("aboutBody");
    expect(patch).not.toHaveProperty("companyAddress");
  });

  it("writes the same fields when the store has no settings row yet", async () => {
    const { caller, values } = settingsCtx(admin, 42, null);
    await caller.updateSettings({ heroHeadline: "Made by hand" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 42, heroHeadline: "Made by hand" }),
    );
  });

  it("rejects a banner that is not a URL", async () => {
    const { caller, set } = settingsCtx();
    await expect(
      caller.updateSettings({ heroImageUrl: "shopfront.jpg" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects copy longer than the column can hold", async () => {
    // Truncation on the way into MySQL would silently cut a merchant's
    // sentence in half; a rejection tells them to shorten it themselves.
    const { caller, set } = settingsCtx();
    await expect(
      caller.updateSettings({ heroHeadline: "x".repeat(121) }),
    ).rejects.toThrow();
    await expect(
      caller.updateSettings({ aboutBody: "x".repeat(5001) }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses an admin of a DIFFERENT store", async () => {
    // The cross-tenant case, which is what actually regresses: a real admin,
    // but of tenant 7, rewriting tenant 42's home page and legal notice.
    // Defacing another merchant's storefront needs only the wrong procedure.
    const { caller, set } = settingsCtx(
      { openId: "google:other", role: "admin", tenantId: 7 },
      42,
    );
    await expect(
      caller.updateSettings({ heroHeadline: "Owned" }),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    const { caller, set } = settingsCtx(null);
    await expect(
      caller.updateSettings({ aboutBody: "Owned" }),
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

  it("returns the store for staff, who work there even if they don't own it", async () => {
    dbMock.getTenantById.mockResolvedValue({
      id: 7,
      slug: "kalakosh",
      name: "Kalakosh",
    });
    const res = await tenantRouter
      .createCaller(ctx({ openId: "u1", role: "staff", tenantId: 7 }))
      .myStore();
    expect(res).toEqual({ slug: "kalakosh", name: "Kalakosh" });
  });

  // The production regression: every fresh sign-in is parked on
  // DEFAULT_TENANT_ID as a customer, so without the role gate every signed-in
  // visitor grew a "MY STORE" button pointing at the platform tenant's admin
  // — which then refused them with Access Denied.
  it("returns null for a customer parked on (or shopping at) a tenant", async () => {
    const res = await tenantRouter
      .createCaller(ctx({ openId: "u1", role: "customer", tenantId: 1 }))
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

// tenant.domainStatus reports the store's registered custom domain and whether
// its DNS points at the platform yet. It shipped as
// `publicProcedure.use(requireTenant)` — the read half of the same mistake
// updateSettings made — so anyone who could reach a store's host learned which
// domain that merchant had bought and how far along the setup was.
describe("tenant.domainStatus authorization", () => {
  function statusCtx(
    user: { openId: string; role?: string; tenantId?: number } | null,
    tenantId = 42,
  ) {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: 9, publicDomain: "shop.example.com" });
    dbMock.db.query = { tenantSettings: { findFirst } };
    return {
      caller: tenantRouter.createCaller(
        ctx(user, { id: tenantId, plan: "pro" }),
      ),
      findFirst,
    };
  }

  it("refuses an anonymous caller", async () => {
    const { caller, findFirst } = statusCtx(null);
    await expect(caller.domainStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin", async () => {
    const { caller, findFirst } = statusCtx({
      openId: "google:shopper",
      role: "user",
      tenantId: 42,
    });
    await expect(caller.domainStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses an admin of a DIFFERENT store", async () => {
    const { caller, findFirst } = statusCtx(
      { openId: "google:other", role: "admin", tenantId: 7 },
      42,
    );
    await expect(caller.domainStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("serves this store's own admin", async () => {
    process.env.PLATFORM_DOMAIN = "app.zolto.ch";
    const { caller } = statusCtx({
      openId: "google:admin",
      role: "admin",
      tenantId: 42,
    });
    await expect(caller.domainStatus()).resolves.toMatchObject({
      domain: "shop.example.com",
      expected: "app.zolto.ch",
      pointsToUs: false,
    });
    delete process.env.PLATFORM_DOMAIN;
  });
});
