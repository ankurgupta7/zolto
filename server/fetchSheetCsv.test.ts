import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db", () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getAllProducts: vi.fn().mockResolvedValue([]),
  getProductById: vi.fn(),
  getVisibleProductById: vi.fn(),
  getVisibleProducts: vi.fn().mockResolvedValue([]),
  setProductVisibility: vi.fn(),
  setProductSold: vi.fn(),
  setProductQuantity: vi.fn(),
  getProductImages: vi.fn(),
  addProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  deleteAllProductImages: vi.fn(),
  getInstagramPosts: vi.fn().mockResolvedValue([]),
  addInstagramPost: vi.fn(),
  deleteInstagramPost: vi.fn(),
  reorderInstagramPost: vi.fn(),
  insertBulkUploadLog: vi.fn(),
  getBulkUploadLogs: vi.fn(),
  getProductsByIds: vi.fn(),
  createOrder: vi.fn(),
  getOrderBySessionId: vi.fn(),
  getProductsMissingTranslation: vi.fn(),
  getPaidOrders: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn(),
  isStripeConfigured: vi.fn(),
}));

const dnsLookup = vi.fn();
vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => dnsLookup(...args),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(role: "admin" | "user" | null = "admin"): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("products.fetchSheetCsv (SSRF guard)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rejects literal loopback URLs", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.products.fetchSheetCsv({ url: "http://127.0.0.1/secret.csv" })
    ).rejects.toThrow(/Internal URLs not allowed/);
  });

  it("rejects the cloud metadata link-local address", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.products.fetchSheetCsv({ url: "http://169.254.169.254/latest/meta-data/" })
    ).rejects.toThrow(/Internal URLs not allowed/);
  });

  it("rejects private RFC1918 ranges", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.products.fetchSheetCsv({ url: "http://10.0.0.5/internal.csv" })
    ).rejects.toThrow(/Internal URLs not allowed/);
    await expect(
      caller.products.fetchSheetCsv({ url: "http://192.168.1.1/internal.csv" })
    ).rejects.toThrow(/Internal URLs not allowed/);
  });

  it("rejects a hostname that resolves to a private/metadata IP (DNS rebinding)", async () => {
    dnsLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.products.fetchSheetCsv({ url: "http://attacker-controlled.example.com/x.csv" })
    ).rejects.toThrow(/Internal URLs not allowed/);
  });

  it("allows a hostname that resolves to a public IP", async () => {
    dnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("a,b,c\n1,2,3"),
    }) as unknown as typeof fetch;

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.fetchSheetCsv({
      url: "http://public-sheet.example.com/x.csv",
    });
    expect(result.csv).toBe("a,b,c\n1,2,3");
  });

  it("requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.products.fetchSheetCsv({ url: "http://example.com/x.csv" })
    ).rejects.toThrow();
  });
});
