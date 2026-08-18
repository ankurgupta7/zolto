import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the data layer so the router is exercised in isolation.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    getPublishedTestimonials: vi.fn(),
    getTestimonials: vi.fn(),
    createTestimonial: vi.fn(),
    updateTestimonial: vi.fn(),
    deleteTestimonial: vi.fn(),
  },
}));

vi.mock("../db", () => dbMock);

import { testimonialsRouter } from "./testimonials";
import type { TrpcContext } from "../_core/context";

const TENANT_ID = 7;
const OTHER_TENANT_ID = 8;

function ctx(
  opts: {
    role?: "staff" | "admin" | "superadmin";
    /** Which tenant the SIGNED-IN user belongs to. */
    userTenantId?: number;
    /** Which store the request host resolves to. */
    tenant?: number | null;
  } = {},
): TrpcContext {
  const { role, userTenantId = TENANT_ID, tenant = TENANT_ID } = opts;
  return {
    user: role ? ({ id: 1, tenantId: userTenantId, role } as never) : null,
    tenant: tenant === null ? null : ({ id: tenant, slug: "shop" } as never),
    req: {} as never,
    res: {} as never,
  };
}

const ROW = {
  id: 3,
  tenantId: TENANT_ID,
  authorName: "Anna M.",
  authorTitle: "Zürich",
  authorPhotoUrl: "https://cdn.example.ch/anna.jpg",
  googleId: "117482910324",
  quote: "The ring arrived beautifully wrapped.",
  rating: 5,
  source: "google" as const,
  published: true,
  sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getPublishedTestimonials.mockResolvedValue([ROW]);
  dbMock.getTestimonials.mockResolvedValue([ROW]);
  dbMock.createTestimonial.mockResolvedValue(11);
  dbMock.updateTestimonial.mockResolvedValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("testimonials.list (public)", () => {
  it("scopes the read to the request's store", async () => {
    await testimonialsRouter.createCaller(ctx()).list();
    expect(dbMock.getPublishedTestimonials).toHaveBeenCalledWith(TENANT_ID);
  });

  it("never ships the customer's Google id to a shopper's browser", async () => {
    const rows = await testimonialsRouter.createCaller(ctx()).list();
    expect(rows[0]).not.toHaveProperty("googleId");
    // The part a shopper actually needs — where the words came from — stays.
    expect(rows[0].source).toBe("google");
  });

  it("returns the quote, author and photo the storefront renders", async () => {
    const rows = await testimonialsRouter.createCaller(ctx()).list();
    expect(rows[0]).toMatchObject({
      authorName: "Anna M.",
      authorTitle: "Zürich",
      authorPhotoUrl: "https://cdn.example.ch/anna.jpg",
      quote: "The ring arrived beautifully wrapped.",
      rating: 5,
    });
  });

  it("throws NOT_FOUND when no store is resolved (no cross-tenant leak)", async () => {
    await expect(
      testimonialsRouter.createCaller(ctx({ tenant: null })).list(),
    ).rejects.toThrow(/not found/i);
    expect(dbMock.getPublishedTestimonials).not.toHaveBeenCalled();
  });
});

describe("testimonials admin writes", () => {
  const input = { authorName: "Anna M.", quote: "Lovely." };

  it("creates against the addressed store", async () => {
    await testimonialsRouter
      .createCaller(ctx({ role: "admin" }))
      .create({ ...input, authorTitle: "Zürich" });
    expect(dbMock.createTestimonial).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, authorName: "Anna M." }),
    );
  });

  it("stores an emptied optional field as NULL, not as a blank string", async () => {
    await testimonialsRouter
      .createCaller(ctx({ role: "admin" }))
      .create({ ...input, authorTitle: "", googleId: "" });
    expect(dbMock.createTestimonial).toHaveBeenCalledWith(
      expect.objectContaining({ authorTitle: null, googleId: null }),
    );
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      testimonialsRouter.createCaller(ctx()).create(input),
    ).rejects.toThrow();
    expect(dbMock.createTestimonial).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin", async () => {
    await expect(
      testimonialsRouter.createCaller(ctx({ role: "staff" })).create(input),
    ).rejects.toThrow();
    expect(dbMock.createTestimonial).not.toHaveBeenCalled();
  });

  // The case that silently regresses: an admin of store 8 pointing a browser at
  // store 7's subdomain. `adminProcedure` alone would let this through.
  it("refuses an admin of a DIFFERENT store addressing this one", async () => {
    const caller = testimonialsRouter.createCaller(
      ctx({ role: "admin", userTenantId: OTHER_TENANT_ID, tenant: TENANT_ID }),
    );
    await expect(caller.create(input)).rejects.toThrow();
    await expect(caller.adminList()).rejects.toThrow();
    await expect(
      caller.update({ id: 3, quote: "Rewritten" }),
    ).rejects.toThrow();
    await expect(caller.delete({ id: 3 })).rejects.toThrow();
    expect(dbMock.createTestimonial).not.toHaveBeenCalled();
    expect(dbMock.updateTestimonial).not.toHaveBeenCalled();
    expect(dbMock.deleteTestimonial).not.toHaveBeenCalled();
  });

  it("scopes update and delete through the addressed store", async () => {
    const caller = testimonialsRouter.createCaller(ctx({ role: "admin" }));
    await caller.update({ id: 3, quote: "Rewritten" });
    expect(dbMock.updateTestimonial).toHaveBeenCalledWith(
      TENANT_ID,
      3,
      expect.objectContaining({ quote: "Rewritten" }),
    );
    await caller.delete({ id: 3 });
    expect(dbMock.deleteTestimonial).toHaveBeenCalledWith(TENANT_ID, 3);
  });

  it("reports a missing row rather than claiming success", async () => {
    dbMock.updateTestimonial.mockResolvedValue(false);
    await expect(
      testimonialsRouter
        .createCaller(ctx({ role: "admin" }))
        .update({ id: 999, quote: "x" }),
    ).rejects.toThrow(/not found/i);
  });

  it("setPublished takes a quote down without touching its words", async () => {
    await testimonialsRouter
      .createCaller(ctx({ role: "admin" }))
      .setPublished({ id: 3, published: false });
    expect(dbMock.updateTestimonial).toHaveBeenCalledWith(TENANT_ID, 3, {
      published: false,
    });
  });

  it("refuses a quote with no words", async () => {
    await expect(
      testimonialsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ authorName: "Anna", quote: "   " }),
    ).rejects.toThrow();
  });

  it("refuses a rating outside 1–5", async () => {
    await expect(
      testimonialsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ ...input, rating: 6 }),
    ).rejects.toThrow();
  });

  it("refuses a photo that isn't a URL", async () => {
    await expect(
      testimonialsRouter
        .createCaller(ctx({ role: "admin" }))
        .create({ ...input, authorPhotoUrl: "anna.jpg" }),
    ).rejects.toThrow();
  });
});
