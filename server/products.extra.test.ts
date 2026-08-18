import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getAllProducts: vi.fn(),
  getProductById: vi.fn(),
  getVisibleProductById: vi.fn(),
  getVisibleProducts: vi.fn(),
  setProductVisibility: vi.fn(),
  setProductSold: vi.fn(),
  setProductQuantity: vi.fn(),
  getProductImages: vi.fn(),
  addProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  deleteAllProductImages: vi.fn(),
  insertBulkUploadLog: vi.fn(),
  getBulkUploadLogs: vi.fn(),
  getProductsMissingTranslation: vi.fn(),
  getPaidOrders: vi.fn(),
  getCategoryPriceStats: vi.fn(),
  getTenantSettings: vi.fn(),
  getTenantCategories: vi.fn(),
}));

const JEWELLERY_CATEGORY_ROWS = [
  { key: "Necklaces", extraIncludes: ["Sets"] },
  { key: "Earrings", extraIncludes: ["Sets"] },
  { key: "Sets" },
  { key: "Rings" },
  { key: "Bracelets" },
  { key: "Bangles" },
  { key: "Anklets" },
  { key: "Brooches" },
  { key: "Hair Accessories" },
  { key: "Other" },
].map((c, i) => ({
  id: i + 1,
  tenantId: 7,
  key: c.key,
  labelEn: c.key,
  labelDe: null,
  extraIncludes: ("extraIncludes" in c ? c.extraIncludes : null) ?? null,
  sortOrder: i,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const storagePut = vi.hoisted(() => vi.fn());
const invokeLLM = vi.hoisted(() => vi.fn());
const assertPublicHostname = vi.hoisted(() => vi.fn());

vi.mock("./db", () => db);
vi.mock("./storage", () => ({ storagePut }));
vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));
vi.mock("./ssrf", () => ({ assertPublicHostname }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const TENANT_ID = 7;

function makeCtx(role: "admin" | "user" | null = "admin"): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          tenantId: TENANT_ID,
          openId: "u",
          email: "a@b.c",
          name: "Admin",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;
  return {
    user,
    tenant: { id: TENANT_ID } as TrpcContext["tenant"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Mondstein-Ring",
    nameEn: null,
    description: "Ein Ring",
    descriptionEn: null,
    price: "185.00",
    category: "Rings",
    imageKey: null,
    imageUrl: null,
    visible: true,
    sold: false,
    quantity: 2,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function llmJson(content: unknown) {
  invokeLLM.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

function admin() {
  return appRouter.createCaller(makeCtx("admin"));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(db)) fn.mockReset();
  db.getAllProducts.mockResolvedValue([]);
  db.getProductImages.mockResolvedValue([]);
  db.getBulkUploadLogs.mockResolvedValue([]);
  db.getProductsMissingTranslation.mockResolvedValue([]);
  db.getPaidOrders.mockResolvedValue([]);
  db.getTenantSettings.mockResolvedValue({
    vertical: "jewellery",
    verticalDescription: null,
  });
  db.getTenantCategories.mockResolvedValue(JEWELLERY_CATEGORY_ROWS);
  db.createProduct.mockResolvedValue([{ insertId: 99, affectedRows: 1 }, []]);
  db.updateProduct.mockResolvedValue(undefined);
  db.insertBulkUploadLog.mockResolvedValue(undefined);
  storagePut.mockResolvedValue({ url: "https://cdn/x.jpg", key: "k" });
  assertPublicHostname.mockResolvedValue(undefined);
});

describe("products.list category filter", () => {
  it("filters visible products by category", async () => {
    db.getVisibleProducts.mockResolvedValue([
      product({ id: 1, category: "Rings" }),
      product({ id: 2, category: "Earrings" }),
    ]);
    const result = await appRouter
      .createCaller(makeCtx(null))
      .products.list({ category: "Rings" });
    expect(result.map((p) => p.id)).toEqual([1]);
  });
});

describe("products stock mutations", () => {
  it("toggleVisibility delegates to setProductVisibility", async () => {
    await admin().products.toggleVisibility({ id: 5, visible: false });
    expect(db.setProductVisibility).toHaveBeenCalledWith(TENANT_ID, 5, false);
  });

  it("toggleSold delegates to setProductSold", async () => {
    await admin().products.toggleSold({ id: 5, sold: true });
    expect(db.setProductSold).toHaveBeenCalledWith(TENANT_ID, 5, true);
  });

  it("setQuantity delegates to setProductQuantity", async () => {
    await admin().products.setQuantity({ id: 5, quantity: 0 });
    expect(db.setProductQuantity).toHaveBeenCalledWith(TENANT_ID, 5, 0);
  });

  it("delete delegates to deleteProduct", async () => {
    await admin().products.delete({ id: 5 });
    expect(db.deleteProduct).toHaveBeenCalledWith(TENANT_ID, 5);
  });

  it("deleteImage delegates to deleteProductImage", async () => {
    await admin().products.deleteImage({ imageId: 3 });
    expect(db.deleteProductImage).toHaveBeenCalledWith(TENANT_ID, 3);
  });
});

describe("products.getImages", () => {
  it("returns a product's images scoped to the tenant", async () => {
    db.getProductImages.mockResolvedValue([{ id: 1 }]);
    const result = await appRouter
      .createCaller(makeCtx(null))
      .products.getImages({ productId: 5 });
    expect(db.getProductImages).toHaveBeenCalledWith(TENANT_ID, 5);
    expect(result).toHaveLength(1);
  });
});

describe("products.mergeDuplicates", () => {
  it("hard-deletes only existing ids and reports the count", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1 }),
      product({ id: 2 }),
    ]);
    db.deleteAllProductImages.mockResolvedValue(undefined);
    db.deleteProduct.mockResolvedValue(undefined);
    const res = await admin().products.mergeDuplicates({ ids: [1, 2, 999] });
    expect(res).toEqual({ removed: 2 });
    expect(db.deleteProduct).toHaveBeenCalledTimes(2);
    expect(db.deleteAllProductImages).toHaveBeenCalledTimes(2);
  });
});

describe("products.addImage", () => {
  it("promotes the uploaded image to primary when the product has none", async () => {
    db.getProductById.mockResolvedValue(product({ id: 5, imageUrl: null }));
    db.addProductImage.mockResolvedValue(undefined);
    const res = await admin().products.addImage({
      productId: 5,
      imageData: "data:image/png;base64,QQ==",
      mimeType: "image/png",
    });
    expect(res.success).toBe(true);
    expect(storagePut).toHaveBeenCalled();
    expect(db.updateProduct).toHaveBeenCalledWith(
      TENANT_ID,
      5,
      expect.objectContaining({ imageUrl: "https://cdn/x.jpg" }),
    );
  });

  it("does not overwrite an existing primary image", async () => {
    db.getProductById.mockResolvedValue(
      product({ id: 5, imageUrl: "https://cdn/existing.jpg" }),
    );
    db.addProductImage.mockResolvedValue(undefined);
    await admin().products.addImage({
      productId: 5,
      imageData: "QQ==",
      mimeType: "image/jpeg",
    });
    expect(db.updateProduct).not.toHaveBeenCalled();
  });

  it("rejects an upload aimed at a non-existent product", async () => {
    db.getProductById.mockResolvedValue(null);
    await expect(
      admin().products.addImage({
        productId: 999,
        imageData: "QQ==",
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow();
  });
});

describe("products.bulkAnalyze", () => {
  beforeEach(() => {
    db.getCategoryPriceStats.mockResolvedValue([]);
  });

  it("returns AI suggestions for each image group", async () => {
    llmJson({
      name: "Mondstein-Ring",
      name_en: "Moonstone Ring",
      description: "Schoen",
      description_en: "Pretty",
      category: "Rings",
    });
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0]).toMatchObject({
      groupId: "g1",
      success: true,
      category: "Rings",
    });
  });

  it("drafts all four Swiss-relevant languages, not just German and English", async () => {
    llmJson({
      name: "Mondstein-Ring",
      name_en: "Moonstone Ring",
      description: "Schoen",
      description_en: "Pretty",
      name_fr: "Bague pierre de lune",
      description_fr: "Joli",
      name_it: "Anello pietra di luna",
      description_it: "Bello",
      category: "Rings",
    });
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0]).toMatchObject({
      nameFr: "Bague pierre de lune",
      nameIt: "Anello pietra di luna",
      descriptionIt: "Bello",
    });
  });

  it("suggests a price grounded in the merchant's own catalogue", async () => {
    db.getCategoryPriceStats.mockResolvedValue([
      { category: "Rings", count: 4, minChf: 50, maxChf: 120, medianChf: 80 },
    ]);
    llmJson({
      name: "Mondstein-Ring",
      name_en: "Moonstone Ring",
      description: "Schoen",
      description_en: "Pretty",
      category: "Rings",
      suggested_price: 85,
      price_basis: "in line with your other Rings (CHF 50-120)",
    });
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0]).toMatchObject({
      suggestedPrice: 85,
      priceBasis: "in line with your other Rings (CHF 50-120)",
    });
    // The merchant's real prices must reach the model, or the number is a guess.
    const prompt = JSON.stringify(invokeLLM.mock.calls[0][0]);
    expect(prompt).toContain("Rings");
    expect(prompt).toContain("120");
  });

  it("suggests NO price when the store has no pricing history", async () => {
    // A new maker would likely accept whatever we propose, so proposing a
    // number we have no basis for could mis-price their work.
    db.getCategoryPriceStats.mockResolvedValue([]);
    llmJson({
      name: "Mondstein-Ring",
      name_en: "Moonstone Ring",
      description: "Schoen",
      description_en: "Pretty",
      category: "Rings",
      suggested_price: 0,
      price_basis: "No pricing history yet — set your own price.",
    });
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0].suggestedPrice).toBeNull();
    expect(res[0].priceBasis).toBeNull();
  });

  it("never invents a price from a nonsensical model answer", async () => {
    db.getCategoryPriceStats.mockResolvedValue([
      { category: "Rings", count: 2, minChf: 50, maxChf: 90, medianChf: 70 },
    ]);
    llmJson({
      name: "R",
      name_en: "R",
      description: "d",
      description_en: "d",
      category: "Rings",
      suggested_price: -5,
      price_basis: "nonsense",
    });
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0].suggestedPrice).toBeNull();
  });

  it("falls back and logs when the LLM fails for a group", async () => {
    invokeLLM.mockRejectedValueOnce(new Error("llm down"));
    const res = await admin().products.bulkAnalyze({
      groups: [
        { groupId: "g1", images: [{ data: "d", mimeType: "image/png" }] },
      ],
    });
    expect(res[0]).toMatchObject({
      groupId: "g1",
      success: false,
      category: "Other",
      // The fallback covers all four Swiss-relevant languages.
      nameFr: "Bijou",
      descriptionFr: "Bijou fait main.",
      nameIt: "Gioiello",
      descriptionIt: "Gioiello fatto a mano.",
      // The fallback must never carry a guessed price.
      suggestedPrice: null,
      priceBasis: null,
    });
    expect(db.insertBulkUploadLog).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "analyze", ref: "g1" }),
    );
  });
});

describe("products.bulkCreate", () => {
  it("creates products and uploads extra images", async () => {
    db.addProductImage.mockResolvedValue(undefined);
    const res = await admin().products.bulkCreate({
      products: [
        {
          name: "Ring A",
          description: "d",
          price: 100,
          category: "Rings",
          images: [
            { data: "data:image/jpeg;base64,QQ==", mimeType: "image/jpeg" },
            { data: "QQ==", mimeType: "image/png" },
          ],
        },
      ],
    });
    expect(res.created).toBe(1);
    expect(db.createProduct).toHaveBeenCalled();
    expect(db.addProductImage).toHaveBeenCalledTimes(1);
  });

  it("records a failure and continues when createProduct throws", async () => {
    db.createProduct.mockRejectedValueOnce(new Error("db down"));
    const res = await admin().products.bulkCreate({
      products: [
        {
          name: "Ring A",
          description: "d",
          price: 100,
          category: "Rings",
          images: [{ data: "QQ==", mimeType: "image/jpeg" }],
        },
      ],
    });
    expect(res.created).toBe(0);
    expect(res.failed).toEqual(["Ring A"]);
    expect(db.insertBulkUploadLog).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "create" }),
    );
  });

  it("warns but still counts the product when an extra image upload fails", async () => {
    storagePut
      .mockResolvedValueOnce({ url: "https://cdn/primary.jpg", key: "p" })
      .mockRejectedValueOnce(new Error("s3 down"));
    const res = await admin().products.bulkCreate({
      products: [
        {
          name: "Ring A",
          description: "d",
          price: 100,
          category: "Rings",
          images: [
            { data: "QQ==", mimeType: "image/jpeg" },
            { data: "QQ==", mimeType: "image/jpeg" },
          ],
        },
      ],
    });
    expect(res.created).toBe(1);
    expect(res.extraImageWarnings.length).toBe(1);
  });

  it("fails the item when createProduct returns no insertId", async () => {
    db.createProduct.mockResolvedValueOnce({});
    const res = await admin().products.bulkCreate({
      products: [
        {
          name: "Ring A",
          description: "d",
          price: 100,
          category: "Rings",
          images: [{ data: "QQ==", mimeType: "image/jpeg" }],
        },
      ],
    });
    expect(res.failed).toEqual(["Ring A"]);
  });
});

describe("products.findMatches", () => {
  it("classifies exact, partial and no matches", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Mondstein Ring" }),
      product({ id: 2, name: "Silber Kollier Deluxe" }),
    ]);
    const res = await admin().products.findMatches({
      items: [
        {
          tempId: "a",
          name: "Mondstein Ring",
          description: "d",
          category: "Rings",
        },
        {
          tempId: "b",
          name: "Kollier",
          description: "d",
          category: "Necklaces",
        },
        { tempId: "c", name: "Nichts", description: "d", category: "Other" },
      ],
    });
    const byTemp = Object.fromEntries(
      res.matches.map((m) => [m.tempId, m.confidence]),
    );
    expect(byTemp).toEqual({ a: "exact", b: "partial", c: "none" });
  });
});

describe("products.bulkUpsertImages", () => {
  it("adds images and optionally updates the description", async () => {
    db.getProductById.mockResolvedValue(product({ id: 5, imageUrl: null }));
    db.addProductImage.mockResolvedValue(undefined);
    const res = await admin().products.bulkUpsertImages({
      items: [
        {
          productId: 5,
          images: [{ data: "QQ==", mimeType: "image/jpeg" }],
          description: "Neu",
          descriptionEn: "New",
          updateDescription: true,
        },
      ],
    });
    expect(res.updated).toBe(1);
    // description update + primary image promotion => 2 updateProduct calls
    expect(db.updateProduct).toHaveBeenCalledTimes(2);
  });

  it("marks the item failed when the product does not exist", async () => {
    db.getProductById.mockResolvedValue(null);
    const res = await admin().products.bulkUpsertImages({
      items: [
        { productId: 404, images: [{ data: "QQ==", mimeType: "image/jpeg" }] },
      ],
    });
    expect(res.failed).toEqual(["404"]);
    expect(db.insertBulkUploadLog).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "upsert_images" }),
    );
  });

  it("collects a warning when an image upload fails", async () => {
    db.getProductById.mockResolvedValue(product({ id: 5, imageUrl: "x" }));
    storagePut.mockRejectedValueOnce(new Error("s3 down"));
    const res = await admin().products.bulkUpsertImages({
      items: [
        { productId: 5, images: [{ data: "QQ==", mimeType: "image/jpeg" }] },
      ],
    });
    expect(res.updated).toBe(1);
    expect(res.extraImageWarnings.length).toBe(1);
  });
});

describe("products.previewAutoTranslateAll", () => {
  it("returns empty when nothing is missing a translation", async () => {
    db.getProductsMissingTranslation.mockResolvedValue([]);
    const res = await admin().products.previewAutoTranslateAll();
    expect(res).toEqual({ proposals: [], total: 0 });
  });

  it("proposes translations from the AI batch", async () => {
    db.getProductsMissingTranslation.mockResolvedValue([
      product({ id: 1, name: "Ring", nameEn: null, descriptionEn: null }),
    ]);
    llmJson({
      items: [{ id: 1, nameEn: "Ring EN", descriptionEn: "Desc EN" }],
    });
    const res = await admin().products.previewAutoTranslateAll();
    expect(res.total).toBe(1);
    expect(res.proposals[0]).toMatchObject({ id: 1, nameEn: "Ring EN" });
  });

  it("swallows an LLM batch error and returns no proposals", async () => {
    db.getProductsMissingTranslation.mockResolvedValue([product({ id: 1 })]);
    invokeLLM.mockRejectedValueOnce(new Error("llm down"));
    const res = await admin().products.previewAutoTranslateAll();
    expect(res.proposals).toEqual([]);
    expect(res.total).toBe(1);
  });
});

describe("products.applyAutoTranslateAll", () => {
  it("persists non-empty patches and skips empty ones", async () => {
    const res = await admin().products.applyAutoTranslateAll({
      items: [{ id: 1, nameEn: "A", descriptionEn: "B" }, { id: 2 }],
    });
    expect(res).toEqual({ updated: 1 });
    expect(db.updateProduct).toHaveBeenCalledTimes(1);
  });
});

describe("products.insights", () => {
  it("aggregates sales and returns AI insights", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, visible: true, sold: false, category: "Rings" }),
    ]);
    db.getPaidOrders.mockResolvedValue([
      { productIds: "1,1", amountTotal: 20000 },
    ]);
    llmJson({
      highlights: ["h"],
      recommendations: ["r"],
      topCategory: "Rings",
      slowMovers: ["x"],
    });
    const res = await admin().products.insights();
    expect(res.topCategory).toBe("Rings");
  });

  it("throws when the AI returns no content", async () => {
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: {} }] });
    await expect(admin().products.insights()).rejects.toThrow(/No AI response/);
  });
});

describe("products.checkDuplicate", () => {
  it("returns no duplicates for an empty catalogue", async () => {
    db.getAllProducts.mockResolvedValue([]);
    const res = await admin().products.checkDuplicate({
      name: "New",
      description: "d",
      category: "Rings",
    });
    expect(res).toEqual({ duplicates: [] });
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("returns AI-detected duplicates", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, category: "Rings" }),
    ]);
    llmJson({
      duplicates: [
        { id: 1, name: "Mondstein-Ring", confidence: "high", reason: "same" },
      ],
    });
    const res = await admin().products.checkDuplicate({
      name: "Mondstein Ring",
      description: "d",
      category: "Rings",
    });
    expect(res.duplicates).toHaveLength(1);
  });

  it("returns empty when the AI response has no content", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, category: "Earrings" }),
    ]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: {} }] });
    const res = await admin().products.checkDuplicate({
      name: "X",
      description: "d",
      category: "Rings",
    });
    expect(res).toEqual({ duplicates: [] });
  });
});

describe("products.previewRecategorizeAll", () => {
  it("returns empty when nothing is in Other", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, category: "Rings" }),
    ]);
    const res = await admin().products.previewRecategorizeAll();
    expect(res).toEqual({ proposals: [], total: 0 });
  });

  it("proposes categories for Other products", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, category: "Other" }),
    ]);
    llmJson({ items: [{ id: 1, category: "Rings" }] });
    const res = await admin().products.previewRecategorizeAll();
    expect(res.proposals[0]).toMatchObject({
      id: 1,
      from: "Other",
      to: "Rings",
    });
  });

  it("swallows a batch failure", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, category: "Other" }),
    ]);
    invokeLLM.mockRejectedValueOnce(new Error("llm down"));
    const res = await admin().products.previewRecategorizeAll();
    expect(res.proposals).toEqual([]);
    expect(res.total).toBe(1);
  });
});

describe("products.applyRecategorizeAll", () => {
  it("updates each product's category", async () => {
    const res = await admin().products.applyRecategorizeAll({
      items: [
        { id: 1, category: "Rings" },
        { id: 2, category: "Earrings" },
      ],
    });
    expect(res).toEqual({ updated: 2 });
    expect(db.updateProduct).toHaveBeenCalledTimes(2);
  });
});

describe("products simple admin ops", () => {
  it("getBulkLogs returns the tenant's logs", async () => {
    db.getBulkUploadLogs.mockResolvedValue([{ id: 1 }]);
    const res = await admin().products.getBulkLogs();
    expect(db.getBulkUploadLogs).toHaveBeenCalledWith(TENANT_ID, 200);
    expect(res).toHaveLength(1);
  });

  it("create inserts a manual product", async () => {
    const res = await admin().products.create({
      name: "New Ring",
      description: "d",
      price: 120,
      category: "Rings",
    });
    expect(res).toEqual({ success: true });
    expect(db.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Ring",
        price: "120",
        source: "manual",
      }),
    );
  });

  it("update stringifies price and forwards the patch", async () => {
    await admin().products.update({ id: 3, name: "X", price: 99 });
    expect(db.updateProduct).toHaveBeenCalledWith(
      TENANT_ID,
      3,
      expect.objectContaining({ name: "X", price: "99" }),
    );
  });

  it("update omits price when not provided", async () => {
    await admin().products.update({ id: 3, category: "Earrings" });
    const patch = db.updateProduct.mock.calls[0][2] as Record<string, unknown>;
    expect(patch.price).toBeUndefined();
    expect(patch.category).toBe("Earrings");
  });
});

// Every write path must accept and persist all four locale columns —
// translations used to be silently dropped at the router boundary.
describe("product locale fields pass through every write path", () => {
  const LOCALES = {
    nameEn: "Ring",
    nameDe: "Ring",
    nameFr: "Bague",
    nameIt: "Anello",
    descriptionEn: "en d",
    descriptionDe: "de d",
    descriptionFr: "fr d",
    descriptionIt: "it d",
  };

  it("create persists fr/it/de translations", async () => {
    await admin().products.create({
      name: "New Ring",
      description: "d",
      price: 120,
      category: "Rings",
      ...LOCALES,
    });
    expect(db.createProduct).toHaveBeenCalledWith(
      expect.objectContaining(LOCALES),
    );
  });

  it("create nulls locale columns that were not provided", async () => {
    await admin().products.create({
      name: "New Ring",
      description: "d",
      price: 120,
      category: "Rings",
      nameEn: "Ring",
    });
    expect(db.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        nameEn: "Ring",
        nameFr: null,
        nameIt: null,
        descriptionFr: null,
        descriptionIt: null,
      }),
    );
  });

  it("update forwards locale fields including explicit nulls", async () => {
    await admin().products.update({
      id: 3,
      nameFr: "Bague",
      descriptionIt: null,
    });
    expect(db.updateProduct).toHaveBeenCalledWith(
      TENANT_ID,
      3,
      expect.objectContaining({ nameFr: "Bague", descriptionIt: null }),
    );
  });

  it("bulkCreate persists fr/it translations", async () => {
    db.createProduct.mockResolvedValueOnce([
      { insertId: 11, affectedRows: 1 },
      [],
    ]);
    await admin().products.bulkCreate({
      products: [
        {
          name: "Ring A",
          description: "d",
          price: 100,
          category: "Rings",
          nameFr: "Bague A",
          nameIt: "Anello A",
          descriptionFr: "fr d",
          descriptionIt: "it d",
          images: [{ data: "QQ==", mimeType: "image/jpeg" }],
        },
      ],
    });
    expect(db.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        nameFr: "Bague A",
        nameIt: "Anello A",
        descriptionFr: "fr d",
        descriptionIt: "it d",
      }),
    );
  });

  it("csvImport patches fr/it on matched rows and persists them on new rows", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Existing Ring" }),
    ]);
    await admin().products.csvImport({
      rows: [
        {
          name: "Existing Ring",
          description: "upd",
          price: 50,
          category: "Rings",
          nameFr: "Bague existante",
          descriptionIt: "it d",
        },
        {
          name: "Brand New",
          description: "d",
          price: 60,
          category: "Earrings",
          nameIt: "Nuovo",
        },
      ],
    });
    expect(db.updateProduct).toHaveBeenCalledWith(
      TENANT_ID,
      1,
      expect.objectContaining({
        nameFr: "Bague existante",
        descriptionIt: "it d",
      }),
    );
    expect(db.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Brand New", nameIt: "Nuovo" }),
    );
  });

  it("bulkUpsertImages patches fr/it descriptions when updating", async () => {
    db.getProductById.mockResolvedValue(product({ id: 5 }));
    db.getProductImages.mockResolvedValue([]);
    await admin().products.bulkUpsertImages({
      items: [
        {
          productId: 5,
          images: [{ data: "QQ==", mimeType: "image/jpeg" }],
          description: "neu",
          descriptionFr: "fr d",
          descriptionIt: "it d",
          updateDescription: true,
        },
      ],
    });
    expect(db.updateProduct).toHaveBeenCalledWith(
      TENANT_ID,
      5,
      expect.objectContaining({
        description: "neu",
        descriptionFr: "fr d",
        descriptionIt: "it d",
      }),
    );
  });
});

describe("products.csvImport", () => {
  it("creates new rows and updates matched ones", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Existing Ring" }),
    ]);
    const res = await admin().products.csvImport({
      rows: [
        {
          name: "Existing Ring",
          description: "upd",
          price: 50,
          category: "Rings",
        },
        {
          name: "Brand New",
          description: "d",
          price: 60,
          category: "Earrings",
        },
      ],
    });
    expect(res.created).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.failed).toEqual([]);
  });

  it("records a failed row when the write throws", async () => {
    db.getAllProducts.mockResolvedValue([]);
    db.createProduct.mockRejectedValueOnce(new Error("db down"));
    const res = await admin().products.csvImport({
      rows: [{ name: "Boom", description: "d", price: 10, category: "Rings" }],
    });
    expect(res.failed).toEqual(["Boom"]);
  });

  // ─── Matching by zolto_id ───────────────────────────────────────────────────
  // The spreadsheet mirror publishes a `zolto_id` column, and re-importing an
  // edited sheet is the normal workflow. Under name-only matching a rename was
  // indistinguishable from a new product, so it silently duplicated.

  it("matches on zoltoId and lets the row carry a rename", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Silver ring" }),
    ]);
    const res = await admin().products.csvImport({
      rows: [
        {
          zoltoId: 1,
          name: "Silver ring (small)",
          description: "d",
          price: 50,
          category: "Rings",
        },
      ],
    });

    expect(res).toMatchObject({ created: 0, updated: 1, failed: [] });
    expect(db.createProduct).not.toHaveBeenCalled();
    expect(db.updateProduct).toHaveBeenCalledWith(
      7,
      1,
      expect.objectContaining({ name: "Silver ring (small)" }),
    );
  });

  it("prefers the id over the name when the two disagree", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Silver ring" }),
      product({ id: 2, name: "Gold stud" }),
    ]);
    await admin().products.csvImport({
      rows: [
        {
          zoltoId: 2,
          // The name matches product 1, but the id says 2. The id wins: it is
          // the stable key, and a name is what the merchant was editing.
          name: "Silver ring",
          description: "d",
          price: 50,
          category: "Rings",
        },
      ],
    });
    expect(db.updateProduct).toHaveBeenCalledWith(7, 2, expect.anything());
  });

  it("still matches by name when the row carries no id", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Silver ring" }),
    ]);
    const res = await admin().products.csvImport({
      rows: [
        {
          name: "silver RING",
          description: "d",
          price: 50,
          category: "Rings",
        },
      ],
    });
    expect(res.updated).toBe(1);
    expect(db.updateProduct).toHaveBeenCalledWith(7, 1, expect.anything());
  });

  /**
   * `getAllProducts` is already tenant-scoped, so an id belonging to another
   * store is simply absent from the lookup — the row falls through to the name
   * match instead of writing across tenants.
   */
  it("cannot reach another store's product through a foreign id", async () => {
    db.getAllProducts.mockResolvedValue([
      product({ id: 1, name: "Silver ring" }),
    ]);
    const res = await admin().products.csvImport({
      rows: [
        {
          zoltoId: 8888,
          name: "Brand new",
          description: "d",
          price: 50,
          category: "Rings",
        },
      ],
    });
    expect(res).toMatchObject({ created: 1, updated: 0 });
    expect(db.updateProduct).not.toHaveBeenCalled();
  });

  it("rejects a non-positive zoltoId at the schema", async () => {
    db.getAllProducts.mockResolvedValue([]);
    await expect(
      admin().products.csvImport({
        rows: [
          {
            zoltoId: 0,
            name: "x",
            description: "d",
            price: 10,
            category: "Rings",
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe("products.parseHandwrittenInventory", () => {
  it("returns extracted inventory items", async () => {
    llmJson({
      items: [
        {
          name: "Amethyst",
          description: "d",
          price: 95,
          category: "Rings",
          quantity: 3,
        },
      ],
    });
    const res = await admin().products.parseHandwrittenInventory({
      imageData: "data:image/jpeg;base64,QQ==",
    });
    expect(res.items[0]).toMatchObject({ name: "Amethyst", quantity: 3 });
  });

  it("throws when the AI returns nothing", async () => {
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: {} }] });
    await expect(
      admin().products.parseHandwrittenInventory({ imageData: "QQ==" }),
    ).rejects.toThrow(/No response from AI/);
  });
});

describe("products.fetchSheetCsv", () => {
  it("rewrites a Google Sheets share URL to a CSV export URL", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      text: async () => "a,b\n1,2",
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await admin().products.fetchSheetCsv({
      url: "https://docs.google.com/spreadsheets/d/ABC123/edit?gid=42",
    });
    expect(res.csv).toContain("a,b");
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/spreadsheets/d/ABC123/export?format=csv");
    expect(calledUrl).toContain("gid=42");
    vi.unstubAllGlobals();
  });

  it("fetches a direct CSV URL unchanged", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, text: async () => "x" }));
    vi.stubGlobal("fetch", fetchSpy);
    await admin().products.fetchSheetCsv({
      url: "https://example.com/data.csv",
    });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://example.com/data.csv");
    vi.unstubAllGlobals();
  });

  it("rejects a non-public hostname (SSRF guard)", async () => {
    assertPublicHostname.mockRejectedValueOnce(new Error("blocked"));
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      admin().products.fetchSheetCsv({ url: "https://169.254.169.254/latest" }),
    ).rejects.toThrow(/blocked/);
    vi.unstubAllGlobals();
  });

  it("throws when the upstream fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" })),
    );
    await expect(
      admin().products.fetchSheetCsv({ url: "https://example.com/x.csv" }),
    ).rejects.toThrow(/Fetch failed/);
    vi.unstubAllGlobals();
  });

  it("rejects a response larger than 2MB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "x".repeat(2_000_001),
      })),
    );
    await expect(
      admin().products.fetchSheetCsv({ url: "https://example.com/x.csv" }),
    ).rejects.toThrow(/too large/);
    vi.unstubAllGlobals();
  });
});
