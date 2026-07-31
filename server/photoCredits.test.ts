import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductById = vi.fn();
const recordPhotoGeneration = vi.fn();
const addPhotoCreditEntry = vi.fn();
const addProductImage = vi.fn();
const countPhotoGenerationsThisMonth = vi.fn();
const generateImage = vi.fn();

vi.mock("./db", () => ({
  getProductById: (...args: unknown[]) => getProductById(...args),
  recordPhotoGeneration: (...args: unknown[]) => recordPhotoGeneration(...args),
  addPhotoCreditEntry: (...args: unknown[]) => addPhotoCreditEntry(...args),
  addProductImage: (...args: unknown[]) => addProductImage(...args),
  countPhotoGenerationsThisMonth: (...args: unknown[]) =>
    countPhotoGenerationsThisMonth(...args),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
}));

import {
  generateStyledProductPhoto,
  photoAllowanceForPlan,
} from "./photoCredits";

const product = {
  id: 42,
  tenantId: 7,
  name: "Pearl Ring",
  imageUrl: "https://cdn.example.com/ring.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  getProductById.mockResolvedValue(product);
  recordPhotoGeneration.mockResolvedValue(true);
  generateImage.mockResolvedValue({
    url: "https://cdn.example.com/styled.png",
  });
  countPhotoGenerationsThisMonth.mockResolvedValue(3);
  addPhotoCreditEntry.mockResolvedValue(undefined);
  addProductImage.mockResolvedValue(undefined);
});

describe("photoAllowanceForPlan", () => {
  it("meters Free, unmeters Pro, and treats unknown plans like Free", () => {
    expect(photoAllowanceForPlan("free")).toBe(5);
    expect(photoAllowanceForPlan("pro")).toBeNull();
    expect(photoAllowanceForPlan("legacy-tier")).toBe(5);
  });
});

describe("generateStyledProductPhoto", () => {
  it("records usage against the Free allowance, generates, attaches, and returns what's left", async () => {
    const result = await generateStyledProductPhoto({
      tenantId: 7,
      plan: "free",
      productId: 42,
      stylePrompt: "Clean catalogue shot on white background",
    });

    expect(recordPhotoGeneration).toHaveBeenCalledWith(7, 5, "product:42");
    expect(generateImage).toHaveBeenCalledWith({
      // The generated image is stored against this tenant's plan allowance.
      tenantId: 7,
      prompt: "Clean catalogue shot on white background",
      originalImages: [
        { url: "https://cdn.example.com/ring.jpg", mimeType: "image/jpeg" },
      ],
      tenantId: 7,
    });
    expect(addProductImage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        productId: 42,
        imageUrl: "https://cdn.example.com/styled.png",
      }),
    );
    // 5 allowed − 3 used this month (post-generation count) = 2 left.
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/styled.png",
      remainingThisMonth: 2,
    });
    // No refund on the happy path.
    expect(addPhotoCreditEntry).not.toHaveBeenCalled();
  });

  it("is unmetered on Pro — no allowance check, null remaining", async () => {
    const result = await generateStyledProductPhoto({
      tenantId: 7,
      plan: "pro",
      productId: 42,
      stylePrompt: "Clean catalogue shot",
    });
    expect(recordPhotoGeneration).toHaveBeenCalledWith(7, null, "product:42");
    expect(result.remainingThisMonth).toBeNull();
    expect(countPhotoGenerationsThisMonth).not.toHaveBeenCalled();
  });

  it("refunds the allowance slot when generation fails", async () => {
    generateImage.mockRejectedValue(new Error("image service down"));

    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 42,
        stylePrompt: "On-model lifestyle shot",
      }),
    ).rejects.toThrow(/image service down/);

    expect(addPhotoCreditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        delta: 1,
        kind: "manual_adjustment",
        note: expect.stringMatching(/refund/i),
      }),
    );
    expect(addProductImage).not.toHaveBeenCalled();
  });

  it("refunds when the service returns no URL", async () => {
    generateImage.mockResolvedValue({});
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/no URL/);
    expect(addPhotoCreditEntry).toHaveBeenCalled();
  });

  it("refuses with an upgrade hint when the monthly allowance is used up", async () => {
    recordPhotoGeneration.mockResolvedValue(false);
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/Upgrade to Pro/);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("rejects unknown products", async () => {
    getProductById.mockResolvedValue(undefined);
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 999,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/Product not found/);
    expect(recordPhotoGeneration).not.toHaveBeenCalled();
  });

  it("requires a source photo on the product", async () => {
    getProductById.mockResolvedValue({ ...product, imageUrl: null });
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/source photo/);
    expect(recordPhotoGeneration).not.toHaveBeenCalled();
  });

  it("requires a non-empty style prompt", async () => {
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        plan: "free",
        productId: 42,
        stylePrompt: "   ",
      }),
    ).rejects.toThrow(/style prompt/i);
    expect(recordPhotoGeneration).not.toHaveBeenCalled();
  });
});
