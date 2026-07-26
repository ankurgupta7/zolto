/**
 * AI photo credits — service layer.
 *
 * Credits are metered because image generation has a real per-image cost
 * (unlike near-free text AI). Balance lives in the append-only
 * photo_credit_ledger table (see drizzle/schema.ts); plans include a monthly
 * bucket (shared/platform.ts PLANS[].includedPhotoCredits, granted by
 * server/billing.ts) and extra credits are pay-as-you-go purchases.
 */

import { TRPCError } from "@trpc/server";
import {
  addPhotoCreditEntry,
  addProductImage,
  consumePhotoCredit,
  getPhotoCreditBalance,
  getProductById,
} from "./db";
import { generateImage } from "./_core/imageGeneration";

export { getPhotoCreditBalance };

/** How many credits one generation costs. Kept a constant so pricing copy stays honest. */
export const CREDITS_PER_GENERATION = 1;

/**
 * Generate an AI-styled product photo and attach it to the product's gallery.
 *
 * Order of operations matters: the credit is consumed BEFORE calling the image
 * service, and refunded (manual_adjustment) if generation fails, so a merchant
 * is never charged for an image they didn't get. Every generated image is
 * recorded as AI-styled (note on the ledger entry + the caller surfaces the
 * disclosure in the UI) — see the platform's disclosure promise in
 * shared/platform.ts AI_PHOTO_CREDITS.
 */
export async function generateStyledProductPhoto(params: {
  tenantId: number;
  productId: number;
  /** What to do with the source photo, e.g. "clean catalogue shot on white". */
  stylePrompt: string;
}): Promise<{ imageUrl: string; balance: number }> {
  const { tenantId, productId, stylePrompt } = params;

  const product = await getProductById(tenantId, productId);
  if (!product) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
  }
  if (!product.imageUrl) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Add a source photo to the product first",
    });
  }
  if (!stylePrompt.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A style prompt is required",
    });
  }

  const consumed = await consumePhotoCredit(tenantId, `product:${productId}`);
  if (!consumed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "No AI photo credits left. Buy a pay-as-you-go pack or wait for your plan's monthly bucket.",
    });
  }

  let imageUrl: string;
  try {
    const result = await generateImage({
      prompt: stylePrompt,
      originalImages: [{ url: product.imageUrl, mimeType: "image/jpeg" }],
    });
    if (!result.url) throw new Error("Image service returned no URL");
    imageUrl = result.url;
  } catch (err) {
    // Generation failed — refund the credit so the merchant never pays for
    // an image they didn't receive.
    await addPhotoCreditEntry({
      tenantId,
      delta: CREDITS_PER_GENERATION,
      kind: "manual_adjustment",
      ref: `product:${productId}`,
      note: "Refund: photo generation failed",
    }).catch((refundErr: unknown) =>
      console.error(
        "[PhotoCredits] Refund after failed generation errored:",
        refundErr,
      ),
    );
    throw err;
  }

  await addProductImage({
    tenantId,
    productId,
    imageKey: imageUrl,
    imageUrl,
    sortOrder: Date.now() % 1_000_000,
  });

  const balance = await getPhotoCreditBalance(tenantId);
  return { imageUrl, balance };
}
