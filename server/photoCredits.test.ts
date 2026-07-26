import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductById = vi.fn();
const consumePhotoCredit = vi.fn();
const addPhotoCreditEntry = vi.fn();
const addProductImage = vi.fn();
const getPhotoCreditBalance = vi.fn();
const generateImage = vi.fn();

vi.mock("./db", () => ({
  getProductById: (...args: unknown[]) => getProductById(...args),
  consumePhotoCredit: (...args: unknown[]) => consumePhotoCredit(...args),
  addPhotoCreditEntry: (...args: unknown[]) => addPhotoCreditEntry(...args),
  addProductImage: (...args: unknown[]) => addProductImage(...args),
  getPhotoCreditBalance: (...args: unknown[]) => getPhotoCreditBalance(...args),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
}));

import { generateStyledProductPhoto } from "./photoCredits";

const product = {
  id: 42,
  tenantId: 7,
  name: "Pearl Ring",
  imageUrl: "https://cdn.example.com/ring.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  getProductById.mockResolvedValue(product);
  consumePhotoCredit.mockResolvedValue(true);
  generateImage.mockResolvedValue({
    url: "https://cdn.example.com/styled.png",
  });
  getPhotoCreditBalance.mockResolvedValue(9);
  addPhotoCreditEntry.mockResolvedValue(undefined);
  addProductImage.mockResolvedValue(undefined);
});

describe("generateStyledProductPhoto", () => {
  it("consumes one credit, generates, attaches the image, returns new balance", async () => {
    const result = await generateStyledProductPhoto({
      tenantId: 7,
      productId: 42,
      stylePrompt: "Clean catalogue shot on white background",
    });

    expect(consumePhotoCredit).toHaveBeenCalledWith(7, "product:42");
    expect(generateImage).toHaveBeenCalledWith({
      prompt: "Clean catalogue shot on white background",
      originalImages: [
        { url: "https://cdn.example.com/ring.jpg", mimeType: "image/jpeg" },
      ],
    });
    expect(addProductImage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        productId: 42,
        imageUrl: "https://cdn.example.com/styled.png",
      }),
    );
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/styled.png",
      balance: 9,
    });
    // No refund on the happy path.
    expect(addPhotoCreditEntry).not.toHaveBeenCalled();
  });

  it("refunds the credit when generation fails", async () => {
    generateImage.mockRejectedValue(new Error("image service down"));

    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
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
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/no URL/);
    expect(addPhotoCreditEntry).toHaveBeenCalled();
  });

  it("refuses without touching the image service when no credits remain", async () => {
    consumePhotoCredit.mockResolvedValue(false);
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/No AI photo credits left/);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("rejects unknown products", async () => {
    getProductById.mockResolvedValue(undefined);
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        productId: 999,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/Product not found/);
    expect(consumePhotoCredit).not.toHaveBeenCalled();
  });

  it("requires a source photo on the product", async () => {
    getProductById.mockResolvedValue({ ...product, imageUrl: null });
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        productId: 42,
        stylePrompt: "Studio light",
      }),
    ).rejects.toThrow(/source photo/);
    expect(consumePhotoCredit).not.toHaveBeenCalled();
  });

  it("requires a non-empty style prompt", async () => {
    await expect(
      generateStyledProductPhoto({
        tenantId: 7,
        productId: 42,
        stylePrompt: "   ",
      }),
    ).rejects.toThrow(/style prompt/i);
    expect(consumePhotoCredit).not.toHaveBeenCalled();
  });
});
