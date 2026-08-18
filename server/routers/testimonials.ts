/**
 * Testimonials — the quotes a store publishes at the foot of its home page.
 *
 * Two audiences, two guards. `list` is public because a testimonial is
 * published copy, like the hero headline; everything that writes is
 * `tenantAdminProcedure` — the documented default for store-admin work
 * (CLAUDE.md) — and scopes every read and write through `ctx.tenant.id`, so an
 * admin of another store pointing at this subdomain is refused rather than
 * served.
 *
 * The public list deliberately does NOT return `googleId`. The merchant records
 * it so they can prove where a quote came from and so the same reviewer can't
 * be entered twice; a shopper has no use for a stranger's Google account id,
 * and shipping it to every browser would turn a private identifier into
 * published data. `source` carries the part the shopper needs ("via Google").
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router, tenantAdminProcedure } from "../_core/trpc";
import {
  createTestimonial,
  deleteTestimonial,
  getPublishedTestimonials,
  getTestimonials,
  updateTestimonial,
} from "../db";

/** Matches the column widths in drizzle/schema.ts. */
const testimonialInput = z.object({
  authorName: z.string().trim().min(1).max(120),
  authorTitle: z.string().trim().max(120).nullable().optional(),
  authorPhotoUrl: z.string().url().max(1024).nullable().optional(),
  // A Google account id is a numeric string; kept loose enough to also hold
  // whatever a merchant copies out of a review link, and bounded by the column.
  googleId: z.string().trim().max(64).nullable().optional(),
  quote: z.string().trim().min(1).max(2000),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  source: z.enum(["manual", "google", "trustpilot"]).optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

/**
 * An emptied optional box arrives as "" and must be stored as NULL, not as a
 * blank string — every "did the merchant supply this?" check downstream (the
 * avatar's photo-or-initials fork, the title line) is a null check.
 */
function blankToNull<T extends Record<string, unknown>>(patch: T): T {
  const out = { ...patch };
  for (const key of Object.keys(out)) {
    if (out[key] === "") (out as Record<string, unknown>)[key] = null;
  }
  return out;
}

export const testimonialsRouter = router({
  /** Public: what the storefront renders. Published rows only, in order. */
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.tenant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    const rows = await getPublishedTestimonials(ctx.tenant.id);
    return rows.map((row) => ({
      id: row.id,
      authorName: row.authorName,
      authorTitle: row.authorTitle,
      authorPhotoUrl: row.authorPhotoUrl,
      quote: row.quote,
      rating: row.rating,
      source: row.source,
    }));
  }),

  /** Admin: the full list, including quotes taken down but not deleted. */
  adminList: tenantAdminProcedure.query(({ ctx }) =>
    getTestimonials(ctx.tenant.id),
  ),

  create: tenantAdminProcedure
    .input(testimonialInput)
    .mutation(async ({ ctx, input }) => {
      const id = await createTestimonial({
        ...blankToNull(input),
        tenantId: ctx.tenant.id,
      });
      return { id };
    }),

  update: tenantAdminProcedure
    .input(
      testimonialInput.partial().extend({ id: z.number().int().positive() }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const updated = await updateTestimonial(
        ctx.tenant.id,
        id,
        blankToNull(patch),
      );
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Testimonial not found",
        });
      }
      return { success: true } as const;
    }),

  /**
   * Take a quote off the storefront without losing the record of it. A
   * separate mutation from `update` because it is the one the admin list's
   * inline switch calls, and it should not be able to touch the words.
   */
  setPublished: tenantAdminProcedure
    .input(
      z.object({ id: z.number().int().positive(), published: z.boolean() }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await updateTestimonial(ctx.tenant.id, input.id, {
        published: input.published,
      });
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Testimonial not found",
        });
      }
      return { success: true } as const;
    }),

  delete: tenantAdminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTestimonial(ctx.tenant.id, input.id);
      return { success: true } as const;
    }),
});
