import { beforeEach, describe, expect, it, vi } from "vitest";

// The rate limiter's shared store is MySQL-backed and fails OPEN, so a stub
// that just returns undefined would let the limit test pass vacuously. This
// is the real fixed-window algorithm, in a Map.
const rateLimitRows = new Map<string, { count: number; resetAt: number }>();

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock("../db", () => ({
  createProduct: vi.fn(),
  createSiteImport: vi.fn(),
  createTenantCategoryRow: vi.fn(),
  getAllProducts: vi.fn(),
  getLatestSiteImportForTenant: vi.fn(),
  getSiteImportForTenant: vi.fn(),
  getTenantById: vi.fn(),
  getTenantCategories: vi.fn(),
  markSiteImportApplied: vi.fn(),
  markSiteImportFailed: vi.fn(),
  setSiteImportCheckoutSession: vi.fn(),
  updateProduct: vi.fn(),
  upsertTenantSettingsFields: vi.fn(),
  // rateLimit.ts imports these from ./db for its shared MySQL window store.
  getOrCreateRateLimitWindow: vi.fn(
    async (key: string, now: number, windowMs: number) => {
      const existing = rateLimitRows.get(key);
      if (!existing || now >= existing.resetAt) {
        const fresh = { count: 1, resetAt: now + windowMs };
        rateLimitRows.set(key, fresh);
        return fresh;
      }
      existing.count += 1;
      return existing;
    },
  ),
  clearRateLimitWindows: vi.fn(async () => {
    rateLimitRows.clear();
  }),
}));

vi.mock("../stripe", () => ({
  isStripeConfigured: vi.fn(() => true),
}));

vi.mock("../billing", () => ({
  createSiteImportCheckoutSession: vi.fn(),
}));

vi.mock("../siteCrawler", () => ({
  crawlSite: vi.fn(),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import {
  createProduct,
  createSiteImport,
  createTenantCategoryRow,
  getAllProducts,
  getLatestSiteImportForTenant,
  getSiteImportForTenant,
  getTenantById,
  getTenantCategories,
  markSiteImportApplied,
  markSiteImportFailed,
  setSiteImportCheckoutSession,
  updateProduct,
  upsertTenantSettingsFields,
} from "../db";
import { createSiteImportCheckoutSession } from "../billing";
import { isStripeConfigured } from "../stripe";
import { crawlSite } from "../siteCrawler";
import { categoryKeyFrom, resetSiteImportRateLimits } from "./siteImport";
import { SITE_IMPORT } from "@shared/platform";

const mocked = <T>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const CALLER_TENANT_ID = 7;
// A DIFFERENT store resolved from the request host — the cross-tenant trap
// CLAUDE.md calls out. An admin of store 7 pointing at store 42's subdomain
// must still only ever read and write store 7.
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

const caller = () => appRouter.createCaller(makeCtx());

function product(over: Record<string, unknown> = {}) {
  return {
    name: "Stoneware mug",
    description: "Hand-thrown",
    price: 42,
    currency: "CHF",
    quantity: 3,
    rawCategory: "Tableware",
    sourceUrl: "https://old.example/mug",
    ...over,
  };
}

function extraction(over: Record<string, unknown> = {}) {
  return {
    products: [product()],
    profile: {},
    categories: ["Tableware"],
    warnings: [],
    ...over,
  };
}

function importRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    tenantId: CALLER_TENANT_ID,
    sourceUrl: "https://old.example",
    status: "previewed",
    extraction: extraction(),
    productCount: 1,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...over,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetSiteImportRateLimits();
  mocked(isStripeConfigured).mockReturnValue(true);
  mocked(getTenantById).mockResolvedValue({
    id: CALLER_TENANT_ID,
    slug: "test-store",
    name: "Test Store",
    stripeCustomerId: "cus_7",
  });
  mocked(getTenantCategories).mockResolvedValue([
    { id: 1, key: "Other", labelEn: "Other" },
  ]);
  mocked(getAllProducts).mockResolvedValue([]);
  mocked(createSiteImport).mockResolvedValue(5);
  mocked(markSiteImportApplied).mockResolvedValue(true);
  mocked(markSiteImportFailed).mockResolvedValue(undefined);
  mocked(createProduct).mockResolvedValue(undefined);
  mocked(updateProduct).mockResolvedValue(undefined);
  mocked(createTenantCategoryRow).mockResolvedValue(undefined);
  mocked(upsertTenantSettingsFields).mockResolvedValue(undefined);
  mocked(setSiteImportCheckoutSession).mockResolvedValue(undefined);
  mocked(getLatestSiteImportForTenant).mockResolvedValue(undefined);
  mocked(crawlSite).mockResolvedValue({
    pages: [],
    attempted: 0,
    warnings: [],
  });
  mocked(createSiteImportCheckoutSession).mockResolvedValue({
    url: "https://checkout.stripe.com/import",
    sessionId: "cs_import",
  });
});

// ─── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  it("refuses anonymous and non-admin callers on every procedure", async () => {
    for (const role of [null, "user"] as const) {
      const c = appRouter.createCaller(makeCtx(role));
      await expect(c.siteImport.status()).rejects.toThrow();
      await expect(
        c.siteImport.preview({ url: "https://old.example" }),
      ).rejects.toThrow();
      await expect(
        c.siteImport.startCheckout({ importId: 5 }),
      ).rejects.toThrow();
      await expect(c.siteImport.applyImport({ importId: 5 })).rejects.toThrow();
    }
  });

  // The case that silently regresses: an admin of store 7 reaching the app on
  // store 42's host. Every read and write must carry 7, never the host's 42.
  it("scopes every read and write to the caller's own store, never the host's", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    const c = caller();

    await c.siteImport.status();
    expect(getTenantById).toHaveBeenCalledWith(CALLER_TENANT_ID);
    expect(getLatestSiteImportForTenant).toHaveBeenCalledWith(CALLER_TENANT_ID);

    await c.siteImport.preview({ url: "https://old.example" });
    expect(mocked(createSiteImport).mock.calls[0][0].tenantId).toBe(
      CALLER_TENANT_ID,
    );

    await c.siteImport.get({ importId: 5 });
    expect(getSiteImportForTenant).toHaveBeenCalledWith(CALLER_TENANT_ID, 5);

    await c.siteImport.applyImport({ importId: 5 });
    expect(markSiteImportApplied).toHaveBeenCalledWith(CALLER_TENANT_ID, 5);
    expect(mocked(createProduct).mock.calls[0][0].tenantId).toBe(
      CALLER_TENANT_ID,
    );
    expect(mocked(upsertTenantSettingsFields).mock.calls[0][0]).toBe(
      CALLER_TENANT_ID,
    );

    // Nothing anywhere in the flow touched the store the host resolved to.
    for (const fn of [
      getTenantById,
      getSiteImportForTenant,
      markSiteImportApplied,
      getAllProducts,
      getTenantCategories,
    ]) {
      for (const call of mocked(fn).mock.calls) {
        expect(call).not.toContain(HOST_TENANT_ID);
      }
    }
  });

  it("cannot open another tenant's import, even with its id", async () => {
    // The scoping is the db query's WHERE, not a check here: asking for a row
    // that belongs to store 42 simply matches nothing.
    mocked(getSiteImportForTenant).mockResolvedValue(undefined);
    await expect(caller().siteImport.get({ importId: 999 })).rejects.toThrow(
      /not found/i,
    );
    expect(getSiteImportForTenant).toHaveBeenCalledWith(CALLER_TENANT_ID, 999);
  });
});

// ─── status ───────────────────────────────────────────────────────────────────

describe("status", () => {
  it("quotes the one price from shared/platform.ts, not a copy of it", async () => {
    const result = await caller().siteImport.status();
    expect(result.offer.priceChf).toBe(SITE_IMPORT.priceChf);
    expect(result.checkoutAvailable).toBe(true);
    expect(result.latest).toBeNull();
  });

  it("says checkout is unavailable rather than offering a dead Pay button", async () => {
    mocked(isStripeConfigured).mockReturnValue(false);
    expect((await caller().siteImport.status()).checkoutAvailable).toBe(false);

    mocked(isStripeConfigured).mockReturnValue(true);
    mocked(getTenantById).mockResolvedValue({ id: 7, stripeCustomerId: null });
    expect((await caller().siteImport.status()).checkoutAvailable).toBe(false);
  });

  it("surfaces the last attempt so a Stripe round-trip can be resumed", async () => {
    mocked(getLatestSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    const result = await caller().siteImport.status();
    expect(result.latest).toMatchObject({ id: 5, status: "paid" });
  });
});

// ─── preview ──────────────────────────────────────────────────────────────────

describe("preview", () => {
  function crawled(html: string, url = "https://old.example/mug") {
    mocked(crawlSite).mockResolvedValue({
      pages: [{ html, url, contentType: "text/html" }],
      attempted: 1,
      warnings: [],
    });
  }

  const mugLd = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Stoneware mug",
    description: "Hand-thrown",
    offers: { price: "42.00", priceCurrency: "CHF" },
  })}</script>`;

  it("rejects an address that isn't one, before spending a crawl on it", async () => {
    await expect(
      caller().siteImport.preview({ url: "not a url" }),
    ).rejects.toThrow();
    await expect(
      caller().siteImport.preview({ url: "javascript:alert(1)" }),
    ).rejects.toThrow();
    await expect(
      caller().siteImport.preview({ url: "file:///etc/passwd" }),
    ).rejects.toThrow();
    expect(crawlSite).not.toHaveBeenCalled();
  });

  it("crawls, extracts, and stores the result with the row", async () => {
    crawled(mugLd);
    const result = await caller().siteImport.preview({
      url: "https://old.example",
    });

    expect(result.productCount).toBe(1);
    expect(result.products[0]).toMatchObject({
      name: "Stoneware mug",
      price: 42,
    });
    // Stored, not re-derived after payment: the merchant must receive the
    // result they were shown, not whatever the site says an hour later.
    const stored = mocked(createSiteImport).mock.calls[0][0];
    expect(stored.productCount).toBe(1);
    expect(
      (stored.extraction as { products: unknown[] }).products,
    ).toHaveLength(1);
    expect(result.importId).toBe(5);
  });

  it("charges nothing to run — no checkout is created by a preview", async () => {
    crawled(mugLd);
    await caller().siteImport.preview({ url: "https://old.example" });
    expect(createSiteImportCheckoutSession).not.toHaveBeenCalled();
  });

  it("says plainly when a site was unreachable instead of showing an empty success", async () => {
    mocked(crawlSite).mockResolvedValue({
      pages: [],
      attempted: 1,
      warnings: [],
    });
    const result = await caller().siteImport.preview({
      url: "https://old.example",
    });
    expect(result.productCount).toBe(0);
    expect(result.warnings.join(" ")).toMatch(/couldn't reach that address/i);
  });

  it("caps the import and says so rather than silently dropping the tail", async () => {
    const many = Array.from(
      { length: 520 },
      (_, i) =>
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "Product",
          name: `Item ${i}`,
          offers: { price: "10" },
        })}</script>`,
    ).join("");
    crawled(many);
    const result = await caller().siteImport.preview({
      url: "https://old.example",
    });
    expect(result.productCount).toBe(500);
    expect(result.warnings.join(" ")).toMatch(/import the first 500/i);
  });

  it("reports which optional pieces are actually there to apply", async () => {
    crawled(
      mugLd +
        `<script type="application/ld+json">${JSON.stringify({
          "@type": "BreadcrumbList",
          itemListElement: [{ name: "Home" }, { name: "Tableware" }],
        })}</script>` +
        `<meta name="theme-color" content="#1b7f5a">` +
        `<link rel="icon" href="/logo.png">` +
        `<meta property="og:site_name" content="Old Shop">`,
    );
    const result = await caller().siteImport.preview({
      url: "https://old.example",
    });
    expect(result.has).toMatchObject({
      logo: true,
      brandColour: true,
      shopProfile: true,
      categories: true,
    });
    expect(result.profile.primaryColor).toBe("#1b7f5a");
  });

  it("stops a merchant hammering someone else's server for free", async () => {
    crawled(mugLd);
    for (let i = 0; i < 8; i++) {
      await caller().siteImport.preview({ url: "https://old.example" });
    }
    await expect(
      caller().siteImport.preview({ url: "https://old.example" }),
    ).rejects.toThrow(/try again/i);
  });
});

// ─── startCheckout ────────────────────────────────────────────────────────────

describe("startCheckout", () => {
  it("opens a Stripe session for exactly the stated price and records it", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(importRow());
    const result = await caller().siteImport.startCheckout({ importId: 5 });

    expect(result.url).toBe("https://checkout.stripe.com/import");
    expect(
      mocked(createSiteImportCheckoutSession).mock.calls[0][0],
    ).toMatchObject({
      siteImportId: 5,
      priceChf: SITE_IMPORT.priceChf,
      productCount: 1,
    });
    expect(setSiteImportCheckoutSession).toHaveBeenCalledWith(
      CALLER_TENANT_ID,
      5,
      "cs_import",
    );
  });

  it("refuses to charge for a crawl that found nothing", async () => {
    // The promise is that a thin result costs nothing. This refusal is the
    // enforcement of it — not just the sentence in the marketing copy.
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        extraction: { products: [], profile: {}, categories: [], warnings: [] },
      }),
    );
    await expect(
      caller().siteImport.startCheckout({ importId: 5 }),
    ).rejects.toThrow(/nothing here worth charging/i);
    expect(createSiteImportCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses to charge twice for the same import", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    await expect(
      caller().siteImport.startCheckout({ importId: 5 }),
    ).rejects.toThrow(/already paid/i);
    expect(createSiteImportCheckoutSession).not.toHaveBeenCalled();
  });
});

// ─── apply ────────────────────────────────────────────────────────────────────

describe("apply", () => {
  it("refuses to write anything until Stripe has said the money arrived", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(importRow());
    await expect(
      caller().siteImport.applyImport({ importId: 5 }),
    ).rejects.toThrow(/hasn't been paid for/i);
    expect(createProduct).not.toHaveBeenCalled();
    expect(markSiteImportApplied).not.toHaveBeenCalled();
  });

  it("imports the catalogue once a payment landed", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });

    expect(result.productsCreated).toBe(1);
    expect(mocked(createProduct).mock.calls[0][0]).toMatchObject({
      name: "Stoneware mug",
      price: "42",
      quantity: 3,
      category: "Tableware",
      visible: true,
    });
    expect(result.categoriesCreated).toContain("Tableware");
  });

  it("claims the row BEFORE writing, so two tabs import one catalogue", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    // The second caller loses the conditional UPDATE.
    mocked(markSiteImportApplied).mockResolvedValue(false);
    await expect(
      caller().siteImport.applyImport({ importId: 5 }),
    ).rejects.toThrow(/already been added/i);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("refuses an already-applied row without touching the catalogue", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "applied" }),
    );
    await expect(
      caller().siteImport.applyImport({ importId: 5 }),
    ).rejects.toThrow(/already been added/i);
    expect(markSiteImportApplied).not.toHaveBeenCalled();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("imports a product with no readable price hidden, never live at zero", async () => {
    // A merchant's first day on Gwinn must not include giving stock away
    // because a crawler missed a number.
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({ products: [product({ price: null })] }),
      }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });
    expect(mocked(createProduct).mock.calls[0][0].visible).toBe(false);
    expect(result.hiddenPending).toBe(1);
  });

  it("updates a product the merchant already added by hand instead of twinning it", async () => {
    mocked(getAllProducts).mockResolvedValue([
      { id: 11, name: "  stoneware MUG ", description: "old", price: "9.00" },
    ]);
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });

    expect(result.productsUpdated).toBe(1);
    expect(result.productsCreated).toBe(0);
    expect(mocked(updateProduct).mock.calls[0].slice(0, 2)).toEqual([
      CALLER_TENANT_ID,
      11,
    ]);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("lands a product in an existing category rather than duplicating it", async () => {
    mocked(getTenantCategories).mockResolvedValue([
      { id: 1, key: "Tableware", labelEn: "Tableware" },
    ]);
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });
    expect(result.categoriesCreated).not.toContain("Tableware");
    expect(mocked(createProduct).mock.calls[0][0].category).toBe("Tableware");
  });

  it("falls back to an existing category when the source's own can't be carried over", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({
          products: [product({ rawCategory: "Shop » Mugs (new!)" })],
          categories: ["Shop » Mugs (new!)"],
        }),
      }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });
    expect(result.categoriesCreated).toHaveLength(0);
    expect(mocked(createProduct).mock.calls[0][0].category).toBe("Other");
  });

  it("carries the logo, brand colour and shop details across", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({
          profile: {
            logoUrl: "https://old.example/logo.png",
            primaryColor: "#1b7f5a",
            email: "hello@old.example",
            phone: "+41 44 000 00 00",
            storeName: "Old Shop",
            about: "We make mugs.",
            addressLine: "Musterstrasse 1",
            postalCode: "4051",
            city: "Basel",
          },
        }),
      }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });

    expect(mocked(upsertTenantSettingsFields).mock.calls[0][1]).toEqual({
      logoUrl: "https://old.example/logo.png",
      primaryColor: "#1b7f5a",
      contactEmail: "hello@old.example",
      contactPhone: "+41 44 000 00 00",
      metaTitle: "Old Shop",
      metaDescription: "We make mugs.",
      // The About page's own copy, not only the search-result snippet — those
      // are different jobs, and "shop story" promises the former.
      aboutBody: "We make mugs.",
      companyAddress: "Musterstrasse 1\n4051 Basel",
    });
    expect(result.brandingApplied).toBe(true);
    expect(result.profileApplied).toBe(true);
  });

  it("writes no address when the source site gave none", async () => {
    // An Impressum showing a blank address block is worse than one still
    // showing the generated placeholder, so a missing address writes nothing.
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({ profile: { storeName: "Old Shop" } }),
      }),
    );
    await caller().siteImport.applyImport({ importId: 5 });
    expect(
      mocked(upsertTenantSettingsFields).mock.calls[0][1],
    ).not.toHaveProperty("companyAddress");
  });

  it("keeps a city-only address readable rather than emitting a stray newline", async () => {
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({ profile: { city: "Basel" } }),
      }),
    );
    await caller().siteImport.applyImport({ importId: 5 });
    expect(mocked(upsertTenantSettingsFields).mock.calls[0][1]).toMatchObject({
      companyAddress: "Basel",
    });
  });

  it("leaves branding and profile alone when the merchant opted out", async () => {
    // Each of these overwrites something the merchant may have set up here by
    // hand, so opting out has to actually mean nothing is written.
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({
          profile: { logoUrl: "https://old.example/logo.png", email: "a@b.ch" },
        }),
      }),
    );
    const result = await caller().siteImport.applyImport({
      importId: 5,
      branding: false,
      profile: false,
      categories: false,
    });
    expect(mocked(upsertTenantSettingsFields).mock.calls[0][1]).toEqual({});
    expect(result.brandingApplied).toBe(false);
    expect(result.profileApplied).toBe(false);
    expect(createTenantCategoryRow).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "Tableware" }),
    );
  });

  it("keeps going past a single bad row and reports which ones failed", async () => {
    mocked(createProduct)
      .mockRejectedValueOnce(new Error("catalogue full"))
      .mockResolvedValue(undefined);
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({
        status: "paid",
        extraction: extraction({
          products: [product({ name: "Bad" }), product({ name: "Good" })],
        }),
      }),
    );
    const result = await caller().siteImport.applyImport({ importId: 5 });
    expect(result.productsFailed).toEqual(["Bad"]);
    expect(result.productsCreated).toBe(1);
  });

  it("records why a wholesale failure happened without leaking it to the merchant", async () => {
    mocked(getTenantCategories).mockRejectedValue(new Error("db is down"));
    mocked(getSiteImportForTenant).mockResolvedValue(
      importRow({ status: "paid" }),
    );
    await expect(
      caller().siteImport.applyImport({ importId: 5 }),
    ).rejects.toThrow(/something went wrong partway/i);
    expect(mocked(markSiteImportFailed).mock.calls[0][2]).toBe("db is down");
  });
});

// ─── categoryKeyFrom ──────────────────────────────────────────────────────────

describe("categoryKeyFrom", () => {
  it("keeps a name the merchant would recognise", () => {
    expect(categoryKeyFrom("  Rings & Bands  ")).toBe("Rings & Bands");
    expect(categoryKeyFrom("Home\n  Décor")).toBe("Home Décor");
  });

  it("drops a name it would have to mangle", () => {
    expect(categoryKeyFrom("Shop » Mugs (new!)")).toBeNull();
    expect(categoryKeyFrom("   ")).toBeNull();
    expect(categoryKeyFrom("/leading-slash")).toBeNull();
  });

  it("bounds the length the column can hold", () => {
    expect(categoryKeyFrom("x".repeat(200))).toHaveLength(64);
  });
});
