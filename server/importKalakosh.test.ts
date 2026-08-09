import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dedupeKey,
  extensionFor,
  importKalakoshCatalog,
  mapSourceProduct,
  normalizePrice,
  readSourceCatalogFromDatabase,
  readSourceCatalogOverHttp,
  resolveAssetUrl,
  resolveCategory,
  createSourceObjectReader,
  shapeSourceRows,
  sourceS3ConfigFromEnv,
  type SourceProduct,
} from "./importKalakosh";

vi.mock("./db", () => ({
  getTenantBySlug: vi.fn(),
  getTenantCategories: vi.fn(),
  getAllProducts: vi.fn(),
  createProduct: vi.fn(),
  addProductImage: vi.fn(),
}));

vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return { StorageQuotaError: actual.StorageQuotaError, storagePut: vi.fn() };
});

vi.mock("./ssrf", () => ({
  assertPublicHostname: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("mysql2/promise", () => ({ createConnection: vi.fn() }));

const s3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: s3Send })),
  GetObjectCommand: vi.fn((input) => ({ input })),
}));

import {
  addProductImage,
  createProduct,
  getAllProducts,
  getTenantBySlug,
  getTenantCategories,
} from "./db";
import { StorageQuotaError, storagePut } from "./storage";
import { createConnection } from "mysql2/promise";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const JEWELLERY_KEYS = [
  "Necklaces",
  "Earrings",
  "Sets",
  "Rings",
  "Bracelets",
  "Bangles",
  "Anklets",
  "Brooches",
  "Hair Accessories",
  "Other",
];

const sourceEarrings: SourceProduct = {
  id: 16,
  name: "Pearl and Tiger's Eye Drops",
  description: "A luminous white pearl paired with a square-cut tiger's eye.",
  nameEn: "Pearl and Tiger's Eye Drops",
  descriptionEn: "A luminous white pearl paired with a square-cut tiger's eye.",
  price: "65.00",
  category: "Earrings",
  imageUrl: "https://f003.backblazeb2.com/file/kalakosh-catalog/products/x.jpg",
  quantity: 1,
  sold: false,
  visible: true,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function imageResponse(contentType = "image/jpeg"): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    arrayBuffer: async () => new ArrayBuffer(4),
  } as unknown as Response;
}

/** Wires up the happy-path destination: tenant 7, jewellery categories, empty catalogue. */
function mockDestination(
  overrides: { plan?: string; existing?: unknown[] } = {},
) {
  vi.mocked(getTenantBySlug).mockResolvedValue({
    id: 7,
    plan: overrides.plan ?? "pro",
  } as never);
  vi.mocked(getTenantCategories).mockResolvedValue(
    JEWELLERY_KEYS.map((key) => ({ key })) as never,
  );
  vi.mocked(getAllProducts).mockResolvedValue(
    (overrides.existing ?? []) as never,
  );
  vi.mocked(createProduct).mockResolvedValue({ insertId: 101 } as never);
  vi.mocked(storagePut).mockResolvedValue({
    key: "import/kalakosh/16/primary_ab12.jpg",
    url: "https://cdn.example.com/import/kalakosh/16/primary_ab12.jpg",
  });
}

describe("dedupeKey", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(dedupeKey("  Pearl Drops  ")).toBe("pearl drops");
    expect(dedupeKey("Pearl Drops")).toBe(dedupeKey("PEARL DROPS"));
  });
});

describe("resolveCategory", () => {
  it("matches the destination tenant's own keys, case-insensitively", () => {
    expect(resolveCategory("earrings", JEWELLERY_KEYS)).toBe("Earrings");
    expect(resolveCategory("Hair Accessories", JEWELLERY_KEYS)).toBe(
      "Hair Accessories",
    );
  });

  it("falls back to Other for keys the tenant doesn't have", () => {
    expect(resolveCategory("Gemstones", JEWELLERY_KEYS)).toBe("Other");
    expect(resolveCategory(null, JEWELLERY_KEYS)).toBe("Other");
  });

  it("uses the tenant's list, not a hard-coded jewellery preset", () => {
    // A ceramics tenant has no "Earrings" key — the product must not claim one.
    expect(resolveCategory("Earrings", ["Vases", "Bowls", "Other"])).toBe(
      "Other",
    );
    expect(resolveCategory("vases", ["Vases", "Bowls", "Other"])).toBe("Vases");
  });
});

describe("normalizePrice", () => {
  it("formats numbers and numeric strings to two decimals", () => {
    expect(normalizePrice("65")).toBe("65.00");
    expect(normalizePrice(65.5)).toBe("65.50");
    expect(normalizePrice("0")).toBe("0.00");
  });

  it("rejects empty, non-numeric and negative values", () => {
    expect(normalizePrice("")).toBeNull();
    expect(normalizePrice(null)).toBeNull();
    expect(normalizePrice("free")).toBeNull();
    expect(normalizePrice(-1)).toBeNull();
  });
});

describe("extensionFor", () => {
  it("prefers the content type, then the URL suffix", () => {
    expect(extensionFor("https://x/y", "image/png")).toBe("png");
    expect(extensionFor("https://x/y.webp", null)).toBe("webp");
    expect(extensionFor("https://x/y.JPEG?v=2", null)).toBe("jpg");
  });

  it("falls back to jpg for unknown suffixes", () => {
    expect(extensionFor("https://x/y.php", null)).toBe("jpg");
    expect(extensionFor("https://x/y", null)).toBe("jpg");
  });
});

describe("resolveAssetUrl", () => {
  it("passes absolute URLs through", () => {
    expect(
      resolveAssetUrl("https://cdn.example.com/a.jpg", "https://k.ch"),
    ).toBe("https://cdn.example.com/a.jpg");
  });

  it("resolves the old deployment's relative /uploads URLs against its host", () => {
    expect(
      resolveAssetUrl("/uploads/products/a.jpg", "https://kalakosh.ch/"),
    ).toBe("https://kalakosh.ch/uploads/products/a.jpg");
  });

  it("returns null for empty input", () => {
    expect(resolveAssetUrl("", "https://kalakosh.ch")).toBeNull();
  });
});

describe("mapSourceProduct", () => {
  it("maps a valid source product", () => {
    expect(mapSourceProduct(sourceEarrings, JEWELLERY_KEYS)).toMatchObject({
      name: "Pearl and Tiger's Eye Drops",
      category: "Earrings",
      price: "65.00",
      source: "manual",
      visible: true,
      sold: false,
      quantity: 1,
    });
  });

  it("keeps stock that has no description rather than dropping it", () => {
    const mapped = mapSourceProduct(
      { ...sourceEarrings, description: "", descriptionEn: null },
      JEWELLERY_KEYS,
    );
    expect(mapped).not.toBeNull();
    expect(mapped?.description).toBe("");
  });

  it("falls back to the English description when the primary one is blank", () => {
    const mapped = mapSourceProduct(
      { ...sourceEarrings, description: "  " },
      JEWELLERY_KEYS,
    );
    expect(mapped?.description).toBe(sourceEarrings.descriptionEn);
  });

  it("preserves hidden, sold and out-of-stock state", () => {
    // MySQL returns tinyint(1) as 0/1, not booleans.
    const mapped = mapSourceProduct(
      { ...sourceEarrings, visible: 0, sold: 1, quantity: 0 },
      JEWELLERY_KEYS,
    );
    expect(mapped).toMatchObject({ visible: false, sold: true, quantity: 0 });
  });

  it("carries the original timestamps so catalogue order survives", () => {
    const mapped = mapSourceProduct(
      { ...sourceEarrings, createdAt: "2024-03-01T10:00:00Z" },
      JEWELLERY_KEYS,
    );
    expect(mapped?.createdAt).toEqual(new Date("2024-03-01T10:00:00Z"));
  });

  it("omits unparseable timestamps instead of writing Invalid Date", () => {
    const mapped = mapSourceProduct(
      { ...sourceEarrings, createdAt: "not a date" },
      JEWELLERY_KEYS,
    );
    expect(mapped?.createdAt).toBeUndefined();
  });

  it("keeps the whatsapp intake source and normalizes anything else", () => {
    expect(
      mapSourceProduct(
        { ...sourceEarrings, source: "whatsapp" },
        JEWELLERY_KEYS,
      )?.source,
    ).toBe("whatsapp");
    expect(
      mapSourceProduct({ ...sourceEarrings, source: "csv" }, JEWELLERY_KEYS)
        ?.source,
    ).toBe("manual");
  });

  it("returns null when name or price is unusable", () => {
    expect(
      mapSourceProduct({ ...sourceEarrings, name: "" }, JEWELLERY_KEYS),
    ).toBeNull();
    expect(
      mapSourceProduct({ ...sourceEarrings, price: "" }, JEWELLERY_KEYS),
    ).toBeNull();
  });
});

describe("shapeSourceRows", () => {
  it("attaches each product's gallery in sort order", () => {
    const shaped = shapeSourceRows(
      [{ id: 1, name: "A" } as never, { id: 2, name: "B" } as never],
      [
        { productId: 1, imageUrl: "b.jpg", imageKey: "k/b.jpg", sortOrder: 2 },
        { productId: 1, imageUrl: "a.jpg", imageKey: "k/a.jpg", sortOrder: 1 },
        { productId: 3, imageUrl: "orphan.jpg", imageKey: null, sortOrder: 0 },
      ],
    );
    expect(shaped[0].images?.map((i) => i.imageUrl)).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
    expect(shaped[0].images?.map((i) => i.imageKey)).toEqual([
      "k/a.jpg",
      "k/b.jpg",
    ]);
    expect(shaped[1].images).toEqual([]);
  });

  it("keeps a gallery row that has only an object key", () => {
    const shaped = shapeSourceRows(
      [{ id: 1, name: "A" } as never],
      [
        { productId: 1, imageUrl: "", imageKey: "k/only.jpg", sortOrder: 0 },
        { productId: 1, imageUrl: "", imageKey: null, sortOrder: 1 },
      ],
    );
    expect(shaped[0].images).toEqual([
      { imageUrl: "", imageKey: "k/only.jpg", sortOrder: 0 },
    ]);
  });
});

describe("sourceS3ConfigFromEnv", () => {
  it("reads the KALAKOSH_S3_* vars, defaulting the region", () => {
    expect(
      sourceS3ConfigFromEnv({
        KALAKOSH_S3_BUCKET: "kalakosh-images",
        KALAKOSH_S3_ACCESS_KEY_ID: "id",
        KALAKOSH_S3_SECRET_ACCESS_KEY: "secret",
        KALAKOSH_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      bucket: "kalakosh-images",
      accessKeyId: "id",
      secretAccessKey: "secret",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "us-east-1",
    });
  });

  it("returns null unless bucket and both credentials are present", () => {
    expect(sourceS3ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      sourceS3ConfigFromEnv({
        KALAKOSH_S3_BUCKET: "b",
        KALAKOSH_S3_ACCESS_KEY_ID: "id",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("never falls back to this deployment's own S3_* vars", () => {
    // Reading them would silently look for Kalakosh's photos in Zolto's bucket.
    expect(
      sourceS3ConfigFromEnv({
        S3_BUCKET: "zolto",
        S3_ACCESS_KEY_ID: "id",
        S3_SECRET_ACCESS_KEY: "secret",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });
});

describe("readSourceCatalogOverHttp", () => {
  it("unwraps the tRPC envelope", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: { data: { json: [sourceEarrings] } } }),
      );
    await expect(
      readSourceCatalogOverHttp("https://k.ch/api", fetchImpl as never),
    ).resolves.toEqual([sourceEarrings]);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    await expect(
      readSourceCatalogOverHttp("https://k.ch/api", fetchImpl as never),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe("createSourceObjectReader", () => {
  const config = {
    bucket: "kalakosh-images",
    region: "auto",
    endpoint: "https://acct.r2.cloudflarestorage.com",
    accessKeyId: "id",
    secretAccessKey: "secret",
  };

  it("reads an object out of the source bucket", async () => {
    s3Send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: "image/webp",
    });

    await expect(
      createSourceObjectReader(config)("products/16.webp"),
    ).resolves.toEqual({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
      // The key, not a URL — this is what the file extension is inferred from.
      origin: "products/16.webp",
    });
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "kalakosh-images",
      Key: "products/16.webp",
    });
  });

  it("path-styles the request for a non-AWS endpoint", () => {
    createSourceObjectReader(config);
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "auto",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        forcePathStyle: true,
      }),
    );
  });

  it("omits the endpoint for plain AWS", () => {
    createSourceObjectReader({ ...config, endpoint: undefined });
    expect(S3Client).toHaveBeenCalledWith(
      expect.not.objectContaining({ forcePathStyle: true }),
    );
  });

  it("throws rather than storing an empty object", async () => {
    s3Send.mockResolvedValue({ Body: undefined });
    await expect(createSourceObjectReader(config)("gone.jpg")).rejects.toThrow(
      /Empty body/,
    );
  });
});

describe("readSourceCatalogFromDatabase", () => {
  it("reads every product and its gallery, unfiltered", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          { id: 1, name: "Hidden", visible: 0, imageUrl: null },
          { id: 2, name: "Sold", sold: 1, imageUrl: "a.jpg" },
        ],
      ])
      .mockResolvedValueOnce([
        [{ productId: 2, imageUrl: "b.jpg", sortOrder: 1 }],
      ]);
    const end = vi.fn();
    vi.mocked(createConnection).mockResolvedValue({ query, end } as never);

    const catalogue = await readSourceCatalogFromDatabase("mysql://old/db");

    expect(catalogue).toHaveLength(2);
    expect(catalogue[0]).toMatchObject({ name: "Hidden", visible: 0 });
    expect(catalogue[1].images).toEqual([
      { imageUrl: "b.jpg", imageKey: null, sortOrder: 1 },
    ]);
    // No WHERE clause — a visibility or image filter here is exactly the bug
    // that left hidden and unphotographed stock behind.
    expect(query.mock.calls[0][0]).not.toMatch(/where/i);
    expect(end).toHaveBeenCalled();
  });

  it("closes the connection even when a query fails", async () => {
    const end = vi.fn();
    vi.mocked(createConnection).mockResolvedValue({
      query: vi.fn().mockRejectedValue(new Error("gone away")),
      end,
    } as never);

    await expect(
      readSourceCatalogFromDatabase("mysql://old/db"),
    ).rejects.toThrow(/gone away/);
    expect(end).toHaveBeenCalled();
  });
});

describe("importKalakoshCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KALAKOSH_DATABASE_URL;
  });

  it("throws when the destination tenant doesn't exist", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue(undefined);
    await expect(
      importKalakoshCatalog({ readSource: async () => [] }),
    ).rejects.toThrow(/No tenant/);
  });

  it("imports products that have no image at all", async () => {
    mockDestination();
    const fetchImpl = vi.fn();

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        {
          ...sourceEarrings,
          id: 20,
          name: "Unphotographed Ring",
          imageUrl: null,
        },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, withoutImage: 1, failed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        name: "Unphotographed Ring",
        imageKey: null,
        imageUrl: null,
      }),
    );
  });

  it("imports hidden and sold-out stock", async () => {
    mockDestination();
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, id: 21, name: "Hidden Piece", visible: 0 },
        { ...sourceEarrings, id: 22, name: "Sold Piece", sold: 1, quantity: 0 },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary.imported).toBe(2);
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Hidden Piece", visible: false }),
    );
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sold Piece", sold: true, quantity: 0 }),
    );
  });

  it("re-hosts the primary image and every gallery image", async () => {
    mockDestination();
    vi.mocked(storagePut)
      .mockResolvedValueOnce({
        key: "k/primary.jpg",
        url: "https://cdn/primary.jpg",
      })
      .mockResolvedValueOnce({ key: "k/1.jpg", url: "https://cdn/1.jpg" });
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        {
          ...sourceEarrings,
          images: [
            // The primary URL repeated in the gallery must not be re-hosted twice.
            { imageUrl: sourceEarrings.imageUrl as string, sortOrder: 0 },
            { imageUrl: "/uploads/products/extra.jpg", sortOrder: 1 },
          ],
        },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({
      imported: 1,
      galleryImages: 1,
      imagesFailed: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // The relative gallery URL was resolved against the old site's host.
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://kalakosh.ch/uploads/products/extra.jpg",
    );
    expect(addProductImage).toHaveBeenCalledWith({
      tenantId: 7,
      productId: 101,
      imageKey: "k/1.jpg",
      imageUrl: "https://cdn/1.jpg",
      sortOrder: 1,
    });
  });

  it("pulls photos from the source bucket by key when one is configured", async () => {
    mockDestination();
    const readSourceObject = vi.fn().mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
      origin: "products/16.webp",
    });
    const fetchImpl = vi.fn();

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        // The relative URL the old deployment writes when S3_PUBLIC_URL is
        // blank — unusable once kalakosh.ch is gone, but the key still works.
        {
          ...sourceEarrings,
          imageUrl: "/uploads/products/16.webp",
          imageKey: "products/16.webp",
        },
      ],
      readSourceObject,
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, imagesFailed: 0 });
    expect(readSourceObject).toHaveBeenCalledWith("products/16.webp");
    // Nothing was asked of the old website at all.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storagePut).toHaveBeenCalledWith(
      7,
      "import/kalakosh/16/primary.webp",
      Buffer.from([1, 2, 3]),
      "image/webp",
    );
  });

  it("imports a product whose only photo reference is an object key", async () => {
    mockDestination();
    const readSourceObject = vi.fn().mockResolvedValue({
      buffer: Buffer.from([1]),
      contentType: "image/jpeg",
      origin: "products/16.jpg",
    });

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, imageUrl: null, imageKey: "products/16.jpg" },
      ],
      readSourceObject,
      fetchImpl: vi.fn() as never,
    });

    expect(summary).toMatchObject({ imported: 1, withoutImage: 0 });
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        imageKey: "import/kalakosh/16/primary_ab12.jpg",
      }),
    );
  });

  it("falls back to the URL when the key is missing from the source bucket", async () => {
    mockDestination();
    const readSourceObject = vi
      .fn()
      .mockRejectedValue(new Error("NoSuchKey: products/16.jpg"));
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, imageKey: "products/16.jpg" },
      ],
      readSourceObject,
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, imagesFailed: 0 });
    expect(readSourceObject).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(sourceEarrings.imageUrl);
  });

  it("uses HTTP only when no source bucket is configured", async () => {
    mockDestination();
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, imageKey: "products/16.jpg" },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(fetchImpl).toHaveBeenCalledWith(sourceEarrings.imageUrl);
  });

  it("de-duplicates the primary against the gallery by object key", async () => {
    mockDestination();
    const readSourceObject = vi.fn().mockResolvedValue({
      buffer: Buffer.from([1]),
      contentType: "image/jpeg",
      origin: "products/16.jpg",
    });

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        {
          ...sourceEarrings,
          imageUrl: "https://cdn/public/16.jpg",
          imageKey: "products/16.jpg",
          images: [
            // Same object, different URL spelling — one photo, not two.
            {
              imageUrl: "/uploads/products/16.jpg",
              imageKey: "products/16.jpg",
            },
            {
              imageUrl: "/uploads/products/16b.jpg",
              imageKey: "products/16b.jpg",
            },
          ],
        },
      ],
      readSourceObject,
      fetchImpl: vi.fn() as never,
    });

    expect(summary).toMatchObject({ imported: 1, galleryImages: 1 });
    expect(readSourceObject).toHaveBeenCalledTimes(2);
    expect(readSourceObject).toHaveBeenLastCalledWith("products/16b.jpg");
  });

  it("still imports the product when its image can't be re-hosted", async () => {
    mockDestination();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 404));

    const summary = await importKalakoshCatalog({
      readSource: async () => [sourceEarrings],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({
      imported: 1,
      imagesFailed: 1,
      withoutImage: 1,
    });
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: null, imageUrl: null }),
    );
  });

  it("keeps the product when a gallery image fails", async () => {
    mockDestination();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(jsonResponse({}, false, 500));

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, images: [{ imageUrl: "https://cdn/extra.jpg" }] },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({
      imported: 1,
      galleryImages: 0,
      imagesFailed: 1,
    });
    expect(addProductImage).not.toHaveBeenCalled();
  });

  it("skips only as many same-name rows as already exist, keeping real duplicates", async () => {
    mockDestination({ existing: [{ name: "Pearl Drops" }] });
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, id: 1, name: "Pearl Drops" },
        { ...sourceEarrings, id: 2, name: "pearl drops" },
        { ...sourceEarrings, id: 3, name: "PEARL DROPS" },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 2, skipped: 1 });
  });

  it("is a no-op on a second run over the same catalogue", async () => {
    mockDestination({ existing: [{ name: "Pearl and Tiger's Eye Drops" }] });

    const summary = await importKalakoshCatalog({
      readSource: async () => [sourceEarrings],
      fetchImpl: vi.fn() as never,
    });

    expect(summary).toMatchObject({ imported: 0, skipped: 1 });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("counts a row with no usable name or price as failed without stopping the run", async () => {
    mockDestination();
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, id: 1, name: "" },
        { ...sourceEarrings, id: 2, name: "Good Piece" },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, failed: 1 });
    expect(createProduct).toHaveBeenCalledTimes(1);
  });

  it("refuses up front rather than half-migrating past the plan's product cap", async () => {
    mockDestination({
      plan: "free",
      existing: Array.from({ length: 199 }, (_, i) => ({ name: `p${i}` })),
    });

    await expect(
      importKalakoshCatalog({
        readSource: async () => [
          { ...sourceEarrings, id: 1, name: "One" },
          { ...sourceEarrings, id: 2, name: "Two" },
        ],
        fetchImpl: vi.fn() as never,
      }),
    ).rejects.toThrow(/200-product limit of the free plan/);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("aborts the run when the tenant's storage quota is exhausted", async () => {
    mockDestination();
    vi.mocked(storagePut).mockRejectedValue(
      new StorageQuotaError({
        usedBytes: 5 * 1024 ** 3,
        limitBytes: 5 * 1024 ** 3,
        incomingBytes: 1024,
        plan: "free",
      }),
    );
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    await expect(
      importKalakoshCatalog({
        readSource: async () => [
          sourceEarrings,
          { ...sourceEarrings, id: 2, name: "Next" },
        ],
        fetchImpl: fetchImpl as never,
      }),
    ).rejects.toBeInstanceOf(StorageQuotaError);
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("keeps going when one product's insert fails", async () => {
    mockDestination();
    vi.mocked(createProduct)
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValueOnce({ insertId: 102 } as never);
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, id: 1, name: "Doomed" },
        { ...sourceEarrings, id: 2, name: "Fine" },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, failed: 1 });
  });

  it("keeps the product when the insert returns no id, skipping its gallery", async () => {
    mockDestination();
    vi.mocked(createProduct).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());

    const summary = await importKalakoshCatalog({
      readSource: async () => [
        { ...sourceEarrings, images: [{ imageUrl: "https://cdn/extra.jpg" }] },
      ],
      fetchImpl: fetchImpl as never,
    });

    expect(summary).toMatchObject({ imported: 1, galleryImages: 0 });
    expect(addProductImage).not.toHaveBeenCalled();
  });

  it("reads from the source database when one is configured", async () => {
    mockDestination();
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ ...sourceEarrings, id: 5, name: "From DB" }]])
      .mockResolvedValueOnce([[]]);
    vi.mocked(createConnection).mockResolvedValue({
      query,
      end: vi.fn(),
    } as never);
    const messages: string[] = [];

    const summary = await importKalakoshCatalog({
      sourceDatabaseUrl: "mysql://old/db",
      fetchImpl: vi.fn().mockResolvedValue(imageResponse()) as never,
      log: (m) => messages.push(m),
    });

    expect(createConnection).toHaveBeenCalledWith("mysql://old/db");
    expect(summary.imported).toBe(1);
    expect(messages.join("\n")).not.toMatch(/No source database configured/);
  });

  it("writes nothing on a dry run but reports the work", async () => {
    mockDestination();

    const summary = await importKalakoshCatalog({
      dryRun: true,
      readSource: async () => [
        sourceEarrings,
        { ...sourceEarrings, id: 2, name: "No Photo", imageUrl: null },
      ],
      fetchImpl: vi.fn() as never,
    });

    expect(summary.imported).toBe(2);
    expect(createProduct).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("warns when it falls back to the storefront-only public endpoint", async () => {
    mockDestination();
    const messages: string[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { data: { json: [] } } }));

    await importKalakoshCatalog({
      fetchImpl: fetchImpl as never,
      log: (m) => messages.push(m),
    });

    expect(messages.join("\n")).toMatch(/No source database configured/);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kalakosh.ch/api/trpc/products.list",
    );
  });
});
