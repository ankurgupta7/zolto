import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { ENV, storagePut } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
  storagePut: vi.fn(),
}));

vi.mock("./env", () => ({ ENV }));
vi.mock("server/storage", () => ({ storagePut }));

import { generateImage } from "./imageGeneration";

beforeEach(() => {
  vi.clearAllMocks();
  ENV.forgeApiUrl = "https://forge.example";
  ENV.forgeApiKey = "forge-key";
  storagePut.mockResolvedValue({ url: "https://cdn/generated.png", key: "k" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateImage", () => {
  it("throws when the forge URL is missing", async () => {
    ENV.forgeApiUrl = "";
    await expect(generateImage({ prompt: "cat" })).rejects.toThrow(
      /FORGE_API_URL/,
    );
  });

  it("throws when the forge key is missing", async () => {
    ENV.forgeApiKey = "";
    await expect(generateImage({ prompt: "cat" })).rejects.toThrow(
      /FORGE_API_KEY/,
    );
  });

  it("generates an image, stores it, and returns the URL", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        image: {
          b64Json: Buffer.from("img").toString("base64"),
          mimeType: "image/png",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await generateImage({ tenantId: 7, prompt: "a serene landscape" });
    expect(res.url).toBe("https://cdn/generated.png");
    expect(fetchSpy.mock.calls[0][0].toString()).toContain(
      "images.v1.ImageService/GenerateImage",
    );
    // storagePut now leads with the tenant whose allowance this image costs.
    const [tenantId, , buffer, mime] = storagePut.mock.calls[0];
    expect(tenantId).toBe(7);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mime).toBe("image/png");
  });

  it("forwards original images for edit requests", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ image: { b64Json: "QQ==", mimeType: "image/png" } }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    await generateImage({
      tenantId: 7,
      prompt: "add a rainbow",
      originalImages: [{ url: "https://x/y.jpg", mimeType: "image/jpeg" }],
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.original_images).toHaveLength(1);
  });

  it("throws with detail when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "boom",
      })),
    );
    await expect(generateImage({ prompt: "cat" })).rejects.toThrow(
      /Image generation request failed .*500/,
    );
  });
});
