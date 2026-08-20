import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYZE_CHUNK_MAX_GROUPS,
  ANALYZE_CHUNK_MAX_IMAGES,
  ANALYZE_MAX_IMAGES_PER_GROUP,
  PUBLISH_CHUNK_MAX_PRODUCTS,
  PUBLISH_MAX_IMAGES_PER_REQUEST,
  batchImagesForPublish,
  chunkGroupsForAnalysis,
  chunkPublishItems,
  photosForAnalysis,
  type PublishImage,
  resizeImageForAnalysis,
  type AnalyzeGroupInput,
} from "./BulkUpload";

function makeGroup(groupId: string, imageSizes: number[]): AnalyzeGroupInput {
  return {
    groupId,
    images: imageSizes.map((size, i) => ({
      data: "x".repeat(size),
      mimeType: i % 2 === 0 ? "image/jpeg" : "image/png",
    })),
  };
}

describe("chunkGroupsForAnalysis", () => {
  it("returns an empty array for no groups", () => {
    expect(chunkGroupsForAnalysis([])).toEqual([]);
  });

  it("sends a small batch as a single request", () => {
    const groups = [makeGroup("a", [10]), makeGroup("b", [20])];
    expect(chunkGroupsForAnalysis(groups)).toEqual([groups]);
  });

  it("never drops or reorders a group", () => {
    const groups = [
      makeGroup("g1", [30, 30, 30]),
      makeGroup("g2", [30, 30, 30]),
      ...Array.from({ length: 14 }, (_, i) => makeGroup(`single-${i}`, [15])),
    ];
    const chunks = chunkGroupsForAnalysis(groups, 100);

    expect(chunks.flat().map((g) => g.groupId)).toEqual(
      groups.map((g) => g.groupId),
    );
  });

  it("splits once the byte budget would be exceeded", () => {
    const groups = [
      makeGroup("a", [40]),
      makeGroup("b", [40]),
      makeGroup("c", [40]),
    ];
    // a+b = 80 fits; +c would be 120 -> c starts a new chunk.
    expect(chunkGroupsForAnalysis(groups, 100, 10, 10)).toEqual([
      [groups[0], groups[1]],
      [groups[2]],
    ]);
  });

  it("caps the group count even when everything fits the byte budget", () => {
    const groups = Array.from({ length: 7 }, (_, i) => makeGroup(`g${i}`, [1]));
    const chunks = chunkGroupsForAnalysis(groups, 1_000_000, 3, 100);

    expect(chunks.map((c) => c.length)).toEqual([3, 3, 1]);
  });

  it("caps images per request, so full groups don't ride together", () => {
    // Even at the 5-image per-group limit, a group cap of 3 alone would
    // permit 15 images in one request — ~22,000 tokens against an
    // 8,000/minute budget, over two minutes of pacing.
    const groups = [
      makeGroup("a", Array(5).fill(1)),
      makeGroup("b", Array(5).fill(1)),
      makeGroup("c", Array(5).fill(1)),
    ];
    const chunks = chunkGroupsForAnalysis(groups, 1_000_000, 3, 6);

    expect(chunks).toEqual([[groups[0]], [groups[1]], [groups[2]]]);
  });

  it("packs small groups up to the image cap", () => {
    const groups = [
      makeGroup("a", [1]),
      makeGroup("b", [1]),
      makeGroup("c", [1, 1, 1, 1]),
      makeGroup("d", [1]),
    ];
    const chunks = chunkGroupsForAnalysis(groups, 1_000_000, 3, 6);

    expect(chunks[0].map((g) => g.groupId)).toEqual(["a", "b", "c"]);
    expect(chunks[1].map((g) => g.groupId)).toEqual(["d"]);
  });

  it("still sends an oversized group on its own rather than dropping it", () => {
    const groups = [makeGroup("huge", [50, 50, 50])];
    expect(chunkGroupsForAnalysis(groups, 100, 3, 2)).toEqual([groups]);
  });

  it("keeps every default chunk inside one request's worth of every ceiling", () => {
    const groups = Array.from({ length: 20 }, (_, i) =>
      makeGroup(`g${i}`, Array((i % 8) + 1).fill(100)),
    );

    for (const chunk of chunkGroupsForAnalysis(groups)) {
      const images = chunk.reduce((sum, g) => sum + g.images.length, 0);
      // A single group larger than a ceiling is sent alone — nothing to split.
      if (chunk.length > 1) {
        expect(images).toBeLessThanOrEqual(ANALYZE_CHUNK_MAX_IMAGES);
        expect(chunk.length).toBeLessThanOrEqual(ANALYZE_CHUNK_MAX_GROUPS);
      }
    }
  });

  it("splits a full 20-group batch into many requests", () => {
    const groups = Array.from({ length: 20 }, (_, i) =>
      makeGroup(`g${i}`, [1, 1, 1]),
    );
    const chunks = chunkGroupsForAnalysis(groups);

    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.flat()).toHaveLength(20);
  });
});

describe("photosForAnalysis", () => {
  it("passes a group at or under the limit through untouched", () => {
    const ids = ["a", "b", "c"];
    expect(photosForAnalysis(ids)).toEqual(ids);
    const exactly = Array.from(
      { length: ANALYZE_MAX_IMAGES_PER_GROUP },
      (_, i) => `p${i}`,
    );
    expect(photosForAnalysis(exactly)).toEqual(exactly);
  });

  it("sends only the first few photos of a larger group", () => {
    // Groq rejects a vision request over five images outright, so an
    // 8-photo group would fail generation rather than be partly analysed.
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const sent = photosForAnalysis(ids);

    expect(sent).toHaveLength(ANALYZE_MAX_IMAGES_PER_GROUP);
    expect(sent).toEqual(ids.slice(0, ANALYZE_MAX_IMAGES_PER_GROUP));
  });

  it("never exceeds what the bulkAnalyze schema accepts", () => {
    // The client must not be able to build a request the router rejects —
    // one over-sized group would fail its whole chunk.
    for (const size of [1, 5, 6, 8, 20]) {
      const ids = Array.from({ length: size }, (_, i) => `p${i}`);
      expect(photosForAnalysis(ids).length).toBeLessThanOrEqual(
        ANALYZE_MAX_IMAGES_PER_GROUP,
      );
    }
  });

  it("does not mutate the group it was given, so publishing keeps every photo", () => {
    // The extras still go to storage — only analysis is bounded.
    const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
    photosForAnalysis(ids);
    expect(ids).toHaveLength(8);
  });
});

describe("resizeImageForAnalysis", () => {
  const originalImage = globalThis.Image;

  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      queueMicrotask(() => {
        if (FakeImage.nextShouldError) {
          this.onerror?.();
        } else {
          this.naturalWidth = FakeImage.nextWidth;
          this.naturalHeight = FakeImage.nextHeight;
          this.onload?.();
        }
      });
    }
    static nextShouldError = false;
    static nextWidth = 100;
    static nextHeight = 100;
  }

  beforeEach(() => {
    FakeImage.nextShouldError = false;
    FakeImage.nextWidth = 100;
    FakeImage.nextHeight = 100;
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("Image", originalImage);
  });

  it("downscales the long edge to 1024 and re-encodes as JPEG", async () => {
    FakeImage.nextWidth = 3000;
    FakeImage.nextHeight = 2000;
    let capturedWidth = 0;
    let capturedHeight = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        capturedWidth = this.width;
        capturedHeight = this.height;
        return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,resized",
    );

    const result = await resizeImageForAnalysis(
      "data:image/png;base64,original",
      "image/png",
    );

    expect(capturedWidth).toBe(1024);
    expect(capturedHeight).toBe(683);
    expect(result).toEqual({
      data: "data:image/jpeg;base64,resized",
      mimeType: "image/jpeg",
    });
  });

  it("never enlarges an image that is already small", async () => {
    FakeImage.nextWidth = 400;
    FakeImage.nextHeight = 300;
    let capturedWidth = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        capturedWidth = this.width;
        return { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,same",
    );

    await resizeImageForAnalysis("data:image/jpeg;base64,x", "image/jpeg");
    expect(capturedWidth).toBe(400);
  });

  it("falls back to the original bytes for an undecodable image", async () => {
    // HEIC outside Safari: one photo must not fail the whole analysis.
    FakeImage.nextShouldError = true;

    const result = await resizeImageForAnalysis(
      "data:image/heic;base64,original",
      "image/heic",
    );

    expect(result).toEqual({
      data: "data:image/heic;base64,original",
      mimeType: "image/heic",
    });
  });

  it("falls back when a 2d context can't be obtained", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const result = await resizeImageForAnalysis(
      "data:image/jpeg;base64,original",
      "image/jpeg",
    );

    expect(result.data).toBe("data:image/jpeg;base64,original");
  });
});

// ─── Publish request shaping ──────────────────────────────────────────────────

// Publishing sends ORIGINALS, not the downscaled copies analysis uses: the
// client accepts 8MB a photo, ~10.7MB once base64'd, against express's 50MB
// body limit. Every confirmed product used to go in one request, so a dozen
// ordinary phone photos were enough to have the whole publish rejected — and
// the failure took every product with it, not just the oversized one.

const img = (bytes: number): PublishImage => ({
  data: "x".repeat(bytes),
  mimeType: "image/jpeg",
});

const bytesOf = (images: PublishImage[]) =>
  images.reduce((sum, i) => sum + i.data.length, 0);

describe("batchImagesForPublish", () => {
  it("keeps a small product's photos in one batch", () => {
    const images = [img(10), img(10)];
    expect(batchImagesForPublish(images, 1000, 8)).toEqual([images]);
  });

  it("splits on the byte budget", () => {
    const images = [img(60), img(60), img(60)];
    const batches = batchImagesForPublish(images, 100, 8);

    expect(batches.map((b) => b.length)).toEqual([1, 1, 1]);
    for (const batch of batches)
      expect(bytesOf(batch)).toBeLessThanOrEqual(100);
  });

  it("splits on the per-request count as well as bytes", () => {
    const images = Array.from({ length: 9 }, () => img(1));
    const batches = batchImagesForPublish(images, 1_000_000, 8);

    // The exact case that used to fail outright: a 9-photo product.
    expect(batches.map((b) => b.length)).toEqual([8, 1]);
  });

  it("never drops a photo, whatever the budget", () => {
    for (const count of [1, 8, 9, 25, 100]) {
      const images = Array.from({ length: count }, () => img(3));
      const batches = batchImagesForPublish(images, 10, 8);
      expect(batches.flat()).toHaveLength(count);
    }
  });

  it("sends a single oversized photo on its own rather than dropping it", () => {
    // A merchant's 8MB photo is ~10.7MB base64. Losing it would be a worse
    // failure than a request that runs slightly over budget.
    const images = [img(500), img(10)];
    const batches = batchImagesForPublish(images, 100, 8);

    expect(batches[0]).toEqual([images[0]]);
    expect(batches.flat()).toHaveLength(2);
  });

  it("preserves photo order across batches, so the gallery keeps its sequence", () => {
    const images = Array.from({ length: 20 }, (_, i) => img(i + 1));
    const batches = batchImagesForPublish(images, 1_000_000, 3);

    expect(batches.flat()).toEqual(images);
  });

  it("defaults to a per-request cap the router will accept", () => {
    const images = Array.from({ length: 30 }, () => img(1));
    for (const batch of batchImagesForPublish(images)) {
      expect(batch.length).toBeLessThanOrEqual(PUBLISH_MAX_IMAGES_PER_REQUEST);
    }
  });
});

describe("chunkPublishItems", () => {
  const product = (id: string, images: PublishImage[]) => ({ id, images });

  it("returns nothing for no products", () => {
    expect(chunkPublishItems([])).toEqual([]);
  });

  it("sends a small batch as one request", () => {
    const items = [product("a", [img(10)]), product("b", [img(10)])];
    expect(chunkPublishItems(items, 1000, 20)).toEqual([items]);
  });

  it("splits once a request would exceed the byte budget", () => {
    const items = [
      product("a", [img(60)]),
      product("b", [img(60)]),
      product("c", [img(60)]),
    ];
    const chunks = chunkPublishItems(items, 100, 20);

    expect(chunks.map((c) => c.map((i) => i.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("caps products per request", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      product(`p${i}`, [img(1)]),
    );
    expect(chunkPublishItems(items, 1_000_000, 3).map((c) => c.length)).toEqual(
      [3, 3, 1],
    );
  });

  it("never drops or reorders a product", () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      product(`p${i}`, [img((i % 5) + 1)]),
    );
    const chunks = chunkPublishItems(items, 7, 4);

    expect(chunks.flat().map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("sends an oversized product alone rather than dropping it", () => {
    const items = [product("huge", [img(500)]), product("small", [img(1)])];
    const chunks = chunkPublishItems(items, 100, 20);

    expect(chunks[0]).toEqual([items[0]]);
    expect(chunks.flat()).toHaveLength(2);
  });

  it("keeps a realistic full batch inside the body limit", () => {
    // 20 products, 5 photos each, at ~4MB of base64 per photo — a plausible
    // shoot, and comfortably over the 50MB limit as one request.
    const FOUR_MB = 4 * 1024 * 1024;
    const items = Array.from({ length: 20 }, (_, i) =>
      product(
        `p${i}`,
        Array.from({ length: 5 }, () => img(FOUR_MB)),
      ),
    );
    // Each product is batched first, as the publish path does.
    const batched = items.flatMap((item) =>
      batchImagesForPublish(item.images).map((images) => ({
        id: item.id,
        images,
      })),
    );

    const chunks = chunkPublishItems(batched);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const size = chunk.reduce((sum, c) => sum + bytesOf(c.images), 0);
      const isSingleOversizedItem = chunk.length === 1;
      expect(size <= 15 * 1024 * 1024 || isSingleOversizedItem).toBe(true);
    }
    // Nothing lost.
    expect(chunks.flat().reduce((n, c) => n + c.images.length, 0)).toBe(100);
  });

  it("defaults to a product cap the router will accept", () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      product(`p${i}`, [img(1)]),
    );
    for (const chunk of chunkPublishItems(items)) {
      expect(chunk.length).toBeLessThanOrEqual(PUBLISH_CHUNK_MAX_PRODUCTS);
    }
  });
});
