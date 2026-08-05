import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantCategory } from "../drizzle/schema";
import {
  assertTenantCategories,
  assertTenantCategory,
  buildIntakeExtractionPrompt,
  categoryKeys,
  categoryTaxonomyLines,
  fallbackProduct,
  getVerticalContext,
  storeIdentityLine,
} from "./verticals";

vi.mock("./db", () => ({
  getTenantSettings: vi.fn(),
  getTenantCategories: vi.fn(),
}));

const { getTenantSettings, getTenantCategories } = await import("./db");

function cat(
  key: string,
  overrides: Partial<TenantCategory> = {},
): TenantCategory {
  return {
    id: 1,
    tenantId: 7,
    key,
    labelEn: key,
    labelDe: null,
    extraIncludes: null,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getTenantSettings).mockReset();
  vi.mocked(getTenantCategories).mockReset();
});

describe("getVerticalContext", () => {
  it("resolves the tenant's vertical, description, and categories", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "ceramics",
      verticalDescription: "  wheel-thrown stoneware  ",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([cat("Mugs & Cups")]);

    const vc = await getVerticalContext(7, "Ton & Teller");
    expect(vc.vertical).toBe("ceramics");
    expect(vc.preset.storeNoun).toBe("a ceramics and pottery studio");
    expect(vc.storeName).toBe("Ton & Teller");
    expect(vc.verticalDescription).toBe("wheel-thrown stoneware");
    expect(vc.categories.map((c) => c.key)).toEqual(["Mugs & Cups"]);
  });

  it("falls back to jewellery for unknown or missing verticals", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "clothing",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([]);

    const vc = await getVerticalContext(7);
    expect(vc.vertical).toBe("jewellery");
    expect(vc.storeName).toBe("the store");
    expect(vc.verticalDescription).toBeNull();
  });
});

describe("categoryKeys", () => {
  it("returns keys in order, optionally dropping folded categories", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "jewellery",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([
      cat("Necklaces", { extraIncludes: ["Sets"] }),
      cat("Earrings", { extraIncludes: ["Sets"] }),
      cat("Sets"),
      cat("Other"),
    ]);
    const vc = await getVerticalContext(7);

    expect(categoryKeys(vc)).toEqual([
      "Necklaces",
      "Earrings",
      "Sets",
      "Other",
    ]);
    expect(categoryKeys(vc, { excludeFolded: true })).toEqual([
      "Necklaces",
      "Earrings",
      "Other",
    ]);
  });
});

describe("storeIdentityLine", () => {
  it("appends the merchant's own description when present", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "vintage",
      verticalDescription: "Swiss mid-century furniture",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([cat("Other")]);
    const vc = await getVerticalContext(7, "Brocante Bern");

    expect(storeIdentityLine(vc)).toBe(
      '"Brocante Bern", a vintage and antiques dealer. The merchant describes their range as: "Swiss mid-century furniture"',
    );
  });
});

describe("categoryTaxonomyLines", () => {
  it("uses preset synonyms for preset keys and labels for custom keys", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "jewellery",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([
      cat("Rings"),
      cat("Talismans", { labelDe: "Talismane" }),
      cat("Other"),
    ]);
    const vc = await getVerticalContext(7);
    const lines = categoryTaxonomyLines(vc);

    expect(lines).toContain(
      "* Rings → finger rings of any style, ring, fingerring",
    );
    expect(lines).toContain("* Talismans → Talismans, Talismane");
    expect(
      lines.trim().endsWith("* Other → anything that does not fit the above"),
    ).toBe(true);
  });
});

describe("fallbackProduct", () => {
  it("returns the vertical's fallback with the Other category", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "art",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([cat("Other")]);
    const vc = await getVerticalContext(7);

    expect(fallbackProduct(vc)).toEqual({
      name: "Kunstwerk",
      nameEn: "Artwork",
      nameFr: "Œuvre d'art",
      nameIt: "Opera d'arte",
      description: "Handgefertigtes Kunstwerk.",
      descriptionEn: "Original handmade artwork.",
      descriptionFr: "Œuvre d'art originale faite main.",
      descriptionIt: "Opera d'arte originale fatta a mano.",
      category: "Other",
    });
  });
});

describe("buildIntakeExtractionPrompt", () => {
  it("offers only non-folded categories and embeds the taxonomy", async () => {
    vi.mocked(getTenantSettings).mockResolvedValue({
      vertical: "jewellery",
    } as never);
    vi.mocked(getTenantCategories).mockResolvedValue([
      cat("Necklaces", { extraIncludes: ["Sets"] }),
      cat("Sets"),
      cat("Rings"),
      cat("Other"),
    ]);
    const vc = await getVerticalContext(7, "Kalakosh");
    const { system, jsonSchema } = buildIntakeExtractionPrompt(vc);

    expect(system).toContain('"Kalakosh", a jewellery boutique');
    expect(system).toContain(
      'Available categories: "Necklaces", "Rings", "Other"',
    );
    expect(system).toContain("* Rings → finger rings");
    const schema = jsonSchema.schema as {
      properties: { category: { enum: string[] } };
    };
    expect(schema.properties.category.enum).toEqual([
      "Necklaces",
      "Rings",
      "Other",
    ]);
  });
});

describe("assertTenantCategory / assertTenantCategories", () => {
  beforeEach(() => {
    vi.mocked(getTenantCategories).mockResolvedValue([
      cat("Bowls"),
      cat("Vases"),
      cat("Other"),
    ]);
  });

  it("accepts categories the tenant actually has", async () => {
    await expect(assertTenantCategory(7, "Bowls")).resolves.toBeUndefined();
    await expect(
      assertTenantCategories(7, ["Bowls", "Vases"]),
    ).resolves.toBeUndefined();
  });

  it("rejects a key from a different tenant's list", async () => {
    await expect(assertTenantCategory(7, "Necklaces")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      assertTenantCategories(7, ["Bowls", "Necklaces"]),
    ).rejects.toThrow(/Unknown category "Necklaces"/);
  });
});
