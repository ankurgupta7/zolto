import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock("../db", () => ({
  getTenantById: vi.fn(),
}));

// ─── Mock Stripe ──────────────────────────────────────────────────────────────
const stripeProductsList = vi.fn();
vi.mock("../stripe", () => ({
  getStripe: vi.fn(() => ({ products: { list: stripeProductsList } })),
  isStripeConfigured: vi.fn(() => true),
}));

vi.mock("../stripeConnect", () => ({
  connectConfigStatus: vi.fn(() => ({ configured: true, missing: [] })),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { getTenantById } from "../db";
import { getStripe, isStripeConfigured } from "../stripe";
import { connectConfigStatus } from "../stripeConnect";

const CALLER_TENANT_ID = 7;
// A DIFFERENT store resolved from the request host — the classic cross-tenant
// trap (CLAUDE.md): an admin of store 7 pointing their request at store 42's
// subdomain must still only ever read/write store 7.
const HOST_TENANT_ID = 42;

function makeCtx(role: "admin" | "user" | null = "admin"): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          tenantId: CALLER_TENANT_ID,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;
  return {
    user,
    tenant: { id: HOST_TENANT_ID } as TrpcContext["tenant"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

function mockTenant(overrides: Record<string, unknown> = {}) {
  (getTenantById as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: CALLER_TENANT_ID,
    slug: "test-store",
    name: "Test Store",
    stripeConnectedAccountId: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getStripe as ReturnType<typeof vi.fn>).mockReturnValue({
    products: { list: stripeProductsList },
  });
  (isStripeConfigured as ReturnType<typeof vi.fn>).mockReturnValue(true);
  (connectConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
    configured: true,
    missing: [],
  });
  mockTenant();
});

// ─── Authorization ────────────────────────────────────────────────────────────

describe("migration router authorization", () => {
  it("refuses anonymous callers on every procedure", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.migration.status()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.migration.parseProviderCsv({ provider: "sumup", csv: "a,b" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.migration.fetchStripeCatalog()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses signed-in non-admins", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.migration.status()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("reads the CALLER's store, never the store the request host resolves to", async () => {
    // ctx.tenant points at store 42; the admin belongs to store 7. Both
    // status and fetchStripeCatalog must scope by the caller's own tenantId.
    const caller = appRouter.createCaller(makeCtx("admin"));
    await caller.migration.status();
    mockTenant({ stripeConnectedAccountId: "acct_own" });
    stripeProductsList.mockResolvedValue({ data: [], has_more: false });
    await caller.migration.fetchStripeCatalog();

    for (const call of (getTenantById as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toBe(CALLER_TENANT_ID);
      expect(call[0]).not.toBe(HOST_TENANT_ID);
    }
  });
});

// ─── status ───────────────────────────────────────────────────────────────────

describe("migration.status", () => {
  it("reports Stripe as not connected but connectable", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const status = await caller.migration.status();
    expect(status.stripe).toEqual({ connected: false, connectAvailable: true });
    expect(status.csvProviders).toContain("sumup");
    expect(status.csvProviders).toContain("worldline");
  });

  it("reports connected once the tenant linked their account", async () => {
    mockTenant({ stripeConnectedAccountId: "acct_123" });
    const caller = appRouter.createCaller(makeCtx());
    const status = await caller.migration.status();
    expect(status.stripe.connected).toBe(true);
  });

  it("reports connect unavailable when the deploy lacks Connect config", async () => {
    (connectConfigStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      configured: false,
      missing: ["STRIPE_CONNECT_CLIENT_ID"],
    });
    const caller = appRouter.createCaller(makeCtx());
    const status = await caller.migration.status();
    expect(status.stripe.connectAvailable).toBe(false);
  });
});

// ─── parseProviderCsv ─────────────────────────────────────────────────────────

describe("migration.parseProviderCsv", () => {
  it("parses a SumUp export into rows", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.migration.parseProviderCsv({
      provider: "sumup",
      csv: "Artikelname;Preis;Kategorie\nSilberring;89,50;Ringe",
    });
    expect(result.rows).toEqual([
      {
        name: "Silberring",
        description: "",
        price: 89.5,
        rawCategory: "Ringe",
        quantity: 1,
        imageUrl: undefined,
      },
    ]);
  });

  it("rejects an unknown provider", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.migration.parseProviderCsv({
        // biome-ignore lint/suspicious/noExplicitAny: exercising input validation
        provider: "square" as any,
        csv: "a,b",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── fetchStripeCatalog ───────────────────────────────────────────────────────

describe("migration.fetchStripeCatalog", () => {
  it("refuses until the tenant has connected their Stripe account", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.migration.fetchStripeCatalog()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(stripeProductsList).not.toHaveBeenCalled();
  });

  it("refuses when Stripe is not configured on the platform", async () => {
    mockTenant({ stripeConnectedAccountId: "acct_123" });
    (getStripe as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.migration.fetchStripeCatalog()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("lists products on the tenant's CONNECTED account and maps them", async () => {
    mockTenant({ stripeConnectedAccountId: "acct_123" });
    stripeProductsList.mockResolvedValue({
      has_more: false,
      data: [
        {
          id: "prod_1",
          name: "Keramiktasse",
          description: "Handgetöpferte Tasse",
          images: [],
          metadata: {},
          default_price: { unit_amount: 3450, currency: "chf" },
        },
      ],
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.migration.fetchStripeCatalog();

    expect(stripeProductsList).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        limit: 100,
        expand: ["data.default_price"],
      }),
      { stripeAccount: "acct_123" },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: "Keramiktasse", price: 34.5 });
  });

  it("pages through the catalogue with starting_after", async () => {
    mockTenant({ stripeConnectedAccountId: "acct_123" });
    const product = (id: string) => ({
      id,
      name: `Item ${id}`,
      default_price: { unit_amount: 1000, currency: "chf" },
    });
    stripeProductsList
      .mockResolvedValueOnce({ has_more: true, data: [product("prod_a")] })
      .mockResolvedValueOnce({ has_more: false, data: [product("prod_b")] });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.migration.fetchStripeCatalog();

    expect(stripeProductsList).toHaveBeenCalledTimes(2);
    expect(stripeProductsList.mock.calls[1][0]).toMatchObject({
      starting_after: "prod_a",
    });
    expect(result.rows.map((r) => r.name)).toEqual([
      "Item prod_a",
      "Item prod_b",
    ]);
  });

  it("turns a Stripe API failure into a merchant-readable error", async () => {
    mockTenant({ stripeConnectedAccountId: "acct_123" });
    stripeProductsList.mockRejectedValue(new Error("stripe down"));
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.migration.fetchStripeCatalog()).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
  });
});
