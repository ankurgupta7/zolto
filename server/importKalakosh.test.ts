import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  dedupeKey,
  importKalakoshCatalog,
  mapRemoteProduct,
  type RemoteProduct,
} from "./importKalakosh";

vi.mock("./db", () => ({
  getTenantBySlug: vi.fn(),
  getAllProducts: vi.fn(),
  createProduct: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("./ssrf", () => ({
  assertPublicHostname: vi.fn().mockResolvedValue(undefined),
}));

import { getTenantBySlug, getAllProducts, createProduct } from "./db";
import { storagePut } from "./storage";

const remoteEarrings: RemoteProduct = {
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
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("dedupeKey", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(dedupeKey("  Pearl Drops  ")).toBe("pearl drops");
    expect(dedupeKey("Pearl Drops")).toBe(dedupeKey("PEARL DROPS"));
  });
});

describe("mapRemoteProduct", () => {
  it("maps a valid remote product", () => {
    const mapped = mapRemoteProduct(remoteEarrings);
    expect(mapped).toMatchObject({
      name: "Pearl and Tiger's Eye Drops",
      category: "Earrings",
      price: "65.00",
      source: "manual",
    });
  });

  it("falls back unknown categories to Other", () => {
    const mapped = mapRemoteProduct({
      ...remoteEarrings,
      category: "Gemstones",
    });
    expect(mapped?.category).toBe("Other");
  });

  it("returns null when name is missing", () => {
    expect(mapRemoteProduct({ ...remoteEarrings, name: "" })).toBeNull();
  });

  it("returns null when price is missing", () => {
    expect(
      mapRemoteProduct({ ...remoteEarrings, price: "" as unknown as string }),
    ).toBeNull();
  });
});

describe("importKalakoshCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the kalakosh tenant doesn't exist", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue(undefined);

    await expect(
      importKalakoshCatalog({ fetchImpl: vi.fn() as unknown as typeof fetch }),
    ).rejects.toThrow(/No tenant/);
  });

  it("skips products already imported and imports new ones, re-hosting the image", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue({ id: 7 } as never);
    vi.mocked(getAllProducts).mockResolvedValue([
      { name: "Existing Piece" } as never,
    ]);
    vi.mocked(storagePut).mockResolvedValue({
      key: "import/kalakosh/1.jpg",
      url: "https://cdn.example.com/import/kalakosh/1.jpg",
    });

    const remote = [
      { ...remoteEarrings, name: "Existing Piece" },
      remoteEarrings,
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ result: { data: { json: remote } } }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response);

    const summary = await importKalakoshCatalog({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary).toEqual({ imported: 1, skipped: 1, failed: 0 });
    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        name: "Pearl and Tiger's Eye Drops",
        imageKey: "import/kalakosh/1.jpg",
        imageUrl: "https://cdn.example.com/import/kalakosh/1.jpg",
      }),
    );
  });

  it("still creates the product when its image can't be re-hosted", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue({ id: 7 } as never);
    vi.mocked(getAllProducts).mockResolvedValue([]);

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ result: { data: { json: [remoteEarrings] } } }),
      )
      .mockResolvedValueOnce(jsonResponse({}, false, 404));

    const summary = await importKalakoshCatalog({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary).toEqual({ imported: 1, skipped: 0, failed: 0 });
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ imageKey: null, imageUrl: null }),
    );
  });

  it("counts a row missing required fields as failed without stopping the run", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue({ id: 7 } as never);
    vi.mocked(getAllProducts).mockResolvedValue([]);

    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        result: { data: { json: [{ ...remoteEarrings, name: "" }] } },
      }),
    );

    const summary = await importKalakoshCatalog({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary).toEqual({ imported: 0, skipped: 0, failed: 1 });
    expect(createProduct).not.toHaveBeenCalled();
  });

  it("throws when the source catalog can't be fetched", async () => {
    vi.mocked(getTenantBySlug).mockResolvedValue({ id: 7 } as never);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500));

    await expect(
      importKalakoshCatalog({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
