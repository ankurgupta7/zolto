/**
 * AI photo generation — service layer.
 *
 * Post-pivot (two-tier pricing), AI photo generation is plan-based, never
 * sold per query: the Free plan includes a monthly allowance
 * (PLANS[].aiPhotoAllowancePerMonth, the "taste of AI"), and Pro is
 * unmetered (allowance null). Usage is logged in the append-only
 * photo_credit_ledger table for audit and for counting the Free allowance.
 */

import { TRPCError } from "@trpc/server";
import { PLANS, PRO_PLAN } from "@shared/platform";
import {
  addPhotoCreditEntry,
  addProductImage,
  countPhotoGenerationsThisMonth,
  recordPhotoGeneration,
  getProductById,
} from "./db";
import { generateImage } from "./_core/imageGeneration";

export { countPhotoGenerationsThisMonth };

/**
 * The plan's monthly AI photo allowance: a number for metered plans (Free),
 * null for unmetered (Pro). Unknown plan values behave like Free.
 */
export function photoAllowanceForPlan(plan: string): number | null {
  const p = PLANS.find((x) => x.id === plan);
  if (!p)
    return PLANS.find((x) => x.id === "free")?.aiPhotoAllowancePerMonth ?? 0;
  return p.aiPhotoAllowancePerMonth;
}

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
  /** The tenant's plan id — decides metered (Free) vs unmetered (Pro). */
  plan: string;
  productId: number;
  /** What to do with the source photo, e.g. "clean catalogue shot on white". */
  stylePrompt: string;
}): Promise<{ imageUrl: string; remainingThisMonth: number | null }> {
  const { tenantId, plan, productId, stylePrompt } = params;

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

  const allowance = photoAllowanceForPlan(plan);
  const consumed = await recordPhotoGeneration(
    tenantId,
    allowance,
    `product:${productId}`,
  );
  if (!consumed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You've used all ${allowance} AI photo shots included this month. Upgrade to ${PRO_PLAN.name} for unmetered AI, or your allowance resets next month.`,
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
    // Generation failed — refund the allowance slot so the merchant never
    // pays (in allowance) for an image they didn't receive.
    await addPhotoCreditEntry({
      tenantId,
      delta: 1,
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

  const remainingThisMonth =
    allowance === null
      ? null
      : Math.max(
          0,
          allowance - (await countPhotoGenerationsThisMonth(tenantId)),
        );
  return { imageUrl, remainingThisMonth };
}
