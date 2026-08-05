import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getVisibleProducts: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Silver Moonstone Ring",
      description: "Delicate sterling silver ring with moonstone",
      price: "185.00",
      category: "Rings",
      imageKey: null,
      imageUrl: null,
      visible: true,
      source: "manual",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getVisibleProductById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Silver Moonstone Ring",
    description: "Delicate sterling silver ring with moonstone",
    price: "185.00",
    category: "Rings",
    imageKey: null,
    imageUrl: null,
    visible: true,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getAllProducts: vi.fn().mockResolvedValue([]),
  createProduct: vi.fn().mockResolvedValue({ insertId: 1 }),
  updateProduct: vi.fn().mockResolvedValue(undefined),
  setProductVisibility: vi.fn().mockResolvedValue(undefined),
  deleteProduct: vi.fn().mockResolvedValue(undefined),
  deleteAllProductImages: vi.fn().mockResolvedValue(undefined),
  getProductsMissingTranslation: vi.fn().mockResolvedValue([]),
  getTenantSettings: vi
    .fn()
    .mockResolvedValue({ vertical: "jewellery", verticalDescription: null }),
  getTenantCategories: vi
    .fn()
    .mockResolvedValue(
      [
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
        extraIncludes: c.extraIncludes ?? null,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    ),
}));

// ─── Mock notification ─────────────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            name: "Pearl Drop Earrings",
            description:
              "Elegant freshwater pearl drop earrings on sterling silver hooks",
            price: 145,
            category: "Earrings",
          }),
        },
      },
    ],
  }),
}));

// ─── Products router tests ─────────────────────────────────────────────────────
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  getAllProducts,
  getVisibleProducts,
  getVisibleProductById,
  createProduct,
  updateProduct,
  setProductVisibility,
  deleteProduct,
  deleteAllProductImages,
  getProductsMissingTranslation,
} from "./db";
import { invokeLLM } from "./_core/llm";

function mockLlmContent(content: unknown) {
  (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: "Mondstein-Ohrhänger",
    nameEn: null,
    description: "d",
    descriptionEn: null,
    price: "185.00",
    category: "Earrings",
    imageKey: null,
    imageUrl: "https://example.com/a.jpg",
    visible: true,
    sold: false,
    quantity: 2,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const TEST_TENANT_ID = 7;

function makeCtx(role: "admin" | "user" | null = null): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          tenantId: TEST_TENANT_ID,
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
    // Storefront reads are scoped to the tenant resolved from the request.
    tenant: { id: TEST_TENANT_ID } as TrpcContext["tenant"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("products.list", () => {
  it("returns visible products for public users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.products.list({});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe("Silver Moonstone Ring");
  });

  it("scopes the read to the request's tenant", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.products.list({});
    expect(getVisibleProducts).toHaveBeenCalledWith(TEST_TENANT_ID);
  });

  it("throws NOT_FOUND when no tenant is resolved (no cross-tenant leak)", async () => {
    const ctx = makeCtx();
    ctx.tenant = null;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.products.list({})).rejects.toThrow(/not found/i);
  });
});

describe("products.getById", () => {
  it("returns a single product by id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.products.getById({ id: 1 });
    expect(result.id).toBe(1);
    expect(result.category).toBe("Rings");
    expect(getVisibleProductById).toHaveBeenCalledWith(TEST_TENANT_ID, 1);
  });

  it("throws NOT_FOUND when no tenant is resolved", async () => {
    const ctx = makeCtx();
    ctx.tenant = null;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.products.getById({ id: 1 })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("products.adminList tenant scoping", () => {
  it("lists only the admin's own tenant's products", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await caller.products.adminList();
    expect(getAllProducts).toHaveBeenCalledWith(TEST_TENANT_ID);
  });
});

describe("products.adminList", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.products.adminList()).rejects.toThrow();
  });

  it("returns all products for admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.adminList();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("products.findDuplicates", () => {
  beforeEach(() => vi.clearAllMocks());

  const complete = makeProduct({ id: 10 });
  const incomplete = makeProduct({
    id: 11,
    name: " mondstein-ohrhänger ",
    imageUrl: null,
    quantity: 0,
    visible: false,
  });
  const unique = makeProduct({
    id: 12,
    name: "Unique Ring",
    category: "Rings",
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.products.findDuplicates()).rejects.toThrow();
  });

  it("groups products by normalized name and suggests the most complete row to keep", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      complete,
      incomplete,
      unique,
    ]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.findDuplicates();

    expect(result).toHaveLength(1);
    expect(result[0].products.map((p) => p.id).sort()).toEqual([10, 11]);
    // complete (visible, in-stock, photographed) should win over incomplete
    expect(result[0].suggestedKeepId).toBe(10);
  });

  it("excludes products with no name collision", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      unique,
    ]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.findDuplicates();
    expect(result).toEqual([]);
  });
});

describe("products.mergeDuplicates", () => {
  beforeEach(() => vi.clearAllMocks());

  const keep = makeProduct({ id: 10 });
  const dropExisting = makeProduct({ id: 11, name: " mondstein-ohrhänger " });
  // Duplicates hidden by an earlier version of this feature still exist as
  // rows — they must be actually removed too, not treated as "already done".
  const dropHiddenExisting = makeProduct({
    id: 12,
    name: "mondstein-ohrhänger",
    visible: false,
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.products.mergeDuplicates({ ids: [11] }),
    ).rejects.toThrow();
  });

  it("permanently deletes exactly the approved ids (and their images), skipping ones no longer present", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      keep,
      dropExisting,
      dropHiddenExisting,
    ]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    // 999 no longer exists and should be skipped; 10 (keep) wasn't even
    // sent, proving the caller controls exactly what gets removed rather
    // than the server inferring group membership itself.
    const result = await caller.products.mergeDuplicates({
      ids: [11, 12, 999],
    });

    expect(result.removed).toBe(2);
    expect(deleteProduct).toHaveBeenCalledTimes(2);
    expect(deleteProduct).toHaveBeenCalledWith(TEST_TENANT_ID, 11);
    expect(deleteProduct).toHaveBeenCalledWith(TEST_TENANT_ID, 12);
    expect(deleteAllProductImages).toHaveBeenCalledWith(TEST_TENANT_ID, 11);
    expect(deleteAllProductImages).toHaveBeenCalledWith(TEST_TENANT_ID, 12);
    expect(setProductVisibility).not.toHaveBeenCalled();
  });
});

describe("products.previewAutoTranslateAll / applyAutoTranslateAll", () => {
  beforeEach(() => vi.clearAllMocks());

  const missingProduct = makeProduct({
    id: 20,
    name: "Silberring",
    nameEn: null,
    descriptionEn: null,
    description: "Ein zarter Silberring.",
  });

  it("throws FORBIDDEN for non-admin on both preview and apply", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.products.previewAutoTranslateAll()).rejects.toThrow();
    await expect(
      caller.products.applyAutoTranslateAll({
        items: [{ id: 20, nameEn: "Silver Ring" }],
      }),
    ).rejects.toThrow();
  });

  it("preview computes translation proposals without writing anything", async () => {
    (
      getProductsMissingTranslation as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([missingProduct]);
    mockLlmContent({
      items: [
        {
          id: 20,
          nameEn: "Silver Ring",
          descriptionEn: "A delicate silver ring.",
        },
      ],
    });

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.previewAutoTranslateAll();

    expect(result.proposals).toEqual([
      {
        id: 20,
        name: "Silberring",
        nameEn: "Silver Ring",
        descriptionEn: "A delicate silver ring.",
      },
    ]);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("apply only writes the specific items the admin approved", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.applyAutoTranslateAll({
      items: [
        { id: 20, nameEn: "Silver Ring", descriptionEn: "A delicate ring." },
      ],
    });

    expect(result.updated).toBe(1);
    expect(updateProduct).toHaveBeenCalledWith(TEST_TENANT_ID, 20, {
      nameEn: "Silver Ring",
      descriptionEn: "A delicate ring.",
    });
  });
});

describe("products.previewRecategorizeAll / applyRecategorizeAll", () => {
  beforeEach(() => vi.clearAllMocks());

  const uncategorised = makeProduct({
    id: 30,
    name: "Ohrhänger",
    category: "Other",
  });

  it("throws FORBIDDEN for non-admin on both preview and apply", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.products.previewRecategorizeAll()).rejects.toThrow();
    await expect(
      caller.products.applyRecategorizeAll({
        items: [{ id: 30, category: "Earrings" }],
      }),
    ).rejects.toThrow();
  });

  it("preview computes category proposals for 'Other' products without writing anything", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      uncategorised,
    ]);
    mockLlmContent({ items: [{ id: 30, category: "Earrings" }] });

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.previewRecategorizeAll();

    expect(result.proposals).toEqual([
      { id: 30, name: "Ohrhänger", from: "Other", to: "Earrings" },
    ]);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("apply only writes the specific items the admin approved", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.applyRecategorizeAll({
      items: [{ id: 30, category: "Earrings" }],
    });

    expect(result.updated).toBe(1);
    expect(updateProduct).toHaveBeenCalledWith(TEST_TENANT_ID, 30, {
      category: "Earrings",
    });
  });
});

describe("products.toggleVisibility", () => {
  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.products.toggleVisibility({ id: 1, visible: false }),
    ).rejects.toThrow();
  });

  it("succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.toggleVisibility({
      id: 1,
      visible: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("products.delete", () => {
  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.products.delete({ id: 1 })).rejects.toThrow();
  });

  it("succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.delete({ id: 1 });
    expect(result.success).toBe(true);
  });
});

describe("products.csvImport", () => {
  beforeEach(() => {
    // createProduct/updateProduct call history isn't reset between tests by
    // default in this file, so clear it to avoid asserting on calls left over
    // from a previous test.
    vi.clearAllMocks();
  });

  const validRow = {
    name: "Mondstein-Ohrhänger",
    description: "Zarte Ohrhänger mit natürlichem Mondstein.",
    price: 185,
    category: "Earrings" as const,
    quantity: 2,
  };

  it("creates a new product when no existing row matches the name", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.csvImport({ rows: [validRow] });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toEqual([]);
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: validRow.name, source: "manual" }),
    );
  });

  it("updates the existing product in place instead of creating a duplicate when the name matches (case/whitespace-insensitive)", async () => {
    (getAllProducts as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 42,
        name: " mondstein-ohrhänger ",
        nameEn: "Existing English Name",
        description: "old description",
        descriptionEn: null,
        price: "150.00",
        category: "Earrings",
        imageKey: null,
        imageUrl: "https://example.com/existing.jpg",
        visible: true,
        sold: false,
        quantity: 1,
        source: "manual",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.csvImport({ rows: [validRow] });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(createProduct).not.toHaveBeenCalled();
    expect(updateProduct).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      42,
      expect.objectContaining({
        description: validRow.description,
        price: "185",
        category: "Earrings",
        quantity: 2,
      }),
    );
    // Re-importing a sheet row that has no English translation or image must not
    // wipe out data an admin already filled in via the admin panel.
    const patch = (updateProduct as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(patch).not.toHaveProperty("nameEn");
    expect(patch).not.toHaveProperty("imageUrl");
  });
});

// ─── Slack LLM parser tests ────────────────────────────────────────────────────
import { parseProductFromMessage } from "./discord";

describe("parseProductFromMessage", () => {
  it("returns null for empty text", async () => {
    const result = await parseProductFromMessage("", TEST_TENANT_ID);
    expect(result).toBeNull();
  });

  it("parses a product message successfully", async () => {
    const result = await parseProductFromMessage(
      "Pearl drop earrings, freshwater pearls on silver hooks. CHF 145",
      TEST_TENANT_ID,
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Pearl Drop Earrings");
    expect(result?.price).toBe(145);
    expect(result?.category).toBe("Earrings");
  });
});

// ─── Handwritten inventory photo import ────────────────────────────────────────

describe("products.parseHandwrittenInventory", () => {
  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.products.parseHandwrittenInventory({
        imageData: "data:image/jpeg;base64,abc123",
      }),
    ).rejects.toThrow();
  });

  it("returns items parsed from the AI vision response for admin users", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  name: "Lemon Quartz",
                  description: "Facettierter Lemon-Quarz-Ring in Silber.",
                  price: 50,
                  category: "Rings",
                  quantity: 1,
                },
                {
                  name: "Amethyst",
                  description: "Dreiteiliges Amethyst-Ring-Set in Silber.",
                  price: 95,
                  category: "Rings",
                  quantity: 3,
                },
              ],
            }),
          },
        },
      ],
    } as never);

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.products.parseHandwrittenInventory({
      imageData: "data:image/jpeg;base64,abc123",
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[1].quantity).toBe(3);
    expect(result.items.every((item) => item.category === "Rings")).toBe(true);
  });

  it("instructs the model to deprioritize Sets/Other and to read quantity shorthand", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
    } as never);

    const caller = appRouter.createCaller(makeCtx("admin"));
    await caller.products.parseHandwrittenInventory({
      imageData: "data:image/jpeg;base64,abc123",
    });

    const call = vi.mocked(invokeLLM).mock.calls.at(-1)?.[0];
    const systemContent = call?.messages.find((m) => m.role === "system")
      ?.content as string;
    expect(systemContent).toContain("last-resort");
    expect(systemContent).toContain("page heading");
    expect(systemContent).toMatch(/3pc/);
  });
});
