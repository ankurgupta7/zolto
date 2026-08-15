/**
 * Discount codes — minting them, listing them, and checking one at the till.
 *
 * Everything that writes is `tenantAdminProcedure` and scopes through
 * `ctx.tenant.id`: a code is money off this store's products, and an admin of
 * another store pointing at this subdomain has no business creating one.
 *
 * `check` is public, because a shopper typing a code into the basket is not
 * signed in. Two things keep that safe:
 *
 * - The subtotal is computed here from the store's own catalogue, never taken
 *   from the request. A client-supplied subtotal would let anyone ask "what
 *   would this code give me on a CHF 10,000 basket" and read the answer, and
 *   more importantly the preview must agree with what checkout actually
 *   charges — which computes the same way from the same rows.
 * - It is rate limited per caller. A discount code is a short secret; without a
 *   bound, this endpoint is an oracle for enumerating one.
 *
 * `check` never holds a redemption slot. Holding happens once, inside
 * checkoutSession.ts, at the moment a Stripe session is actually opened —
 * otherwise idly typing a one-use code into the basket would burn it.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  DEFAULT_DISCOUNT_CODE_LENGTH,
  MAX_BATCH_SIZE,
  MAX_DISCOUNT_CODE_LENGTH,
  describeDiscount,
  evaluateDiscount,
  generateDiscountCode,
  generateDiscountCodes,
  normaliseDiscountCode,
} from "@shared/discounts";
import { publicProcedure, router, tenantAdminProcedure } from "../_core/trpc";
import {
  createDiscountCodes,
  deleteDiscountCode,
  getDiscountCodeByCode,
  getDiscountCodes,
  getDiscountRedemptions,
  getProductsByIds,
  getTenantSettings,
  updateDiscountCode,
} from "../db";
import { createRateLimiter } from "../rateLimit";
import { sweepExpiredDiscountHolds } from "../discounts";
import { MAX_CHECKOUT_ITEMS } from "../checkoutSession";

/**
 * A code is a short secret and this endpoint says whether a guess was right.
 * 30 tries in 5 minutes is far past any shopper mistyping the code on their
 * receipt, and far short of walking the keyspace.
 */
const codeCheckLimiter = createRateLimiter({
  limit: 30,
  windowMs: 5 * 60 * 1000,
});

/** The terms a merchant sets. Bounds match drizzle/schema.ts. */
const termsInput = z.object({
  kind: z.enum(["percent", "amount"]),
  /** Whole percent (1–100) for "percent", minor units for "amount". */
  value: z.number().int().positive(),
  campaign: z.string().trim().max(64).nullable().optional(),
  minSubtotalRappen: z.number().int().min(0).nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

/**
 * A percentage over 100 is not a discount, it is a refund. Checked here rather
 * than left to `discountAmountRappen`'s clamp so the merchant is told at the
 * point they typed it instead of discovering it at a till.
 */
function assertSaneTerms(input: {
  kind: "percent" | "amount";
  value: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
}) {
  if (input.kind === "percent" && input.value > 100) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A percentage discount can't be more than 100%.",
    });
  }
  if (input.startsAt && input.expiresAt && input.expiresAt <= input.startsAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The end date has to come after the start date.",
    });
  }
}

export const discountsRouter = router({
  /** Admin: every code this store has minted, newest first. */
  list: tenantAdminProcedure.query(async ({ ctx }) => {
    // Give back the slots behind checkouts that were opened and abandoned,
    // first, so "23 of 50 used" is a number the merchant can act on rather than
    // one inflated by baskets nobody ever paid for.
    await sweepExpiredDiscountHolds({ tenantId: ctx.tenant.id });
    const rows = await getDiscountCodes(ctx.tenant.id);
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      kind: row.kind,
      value: row.value,
      currency: row.currency,
      campaign: row.campaign,
      minSubtotalRappen: row.minSubtotalRappen,
      maxRedemptions: row.maxRedemptions,
      redeemedCount: row.redeemedCount,
      startsAt: row.startsAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      /** Rendered in the list so the terms read as a sentence, not a schema. */
      description: describeDiscount(row),
    }));
  }),

  /**
   * Admin: mint one code or a batch of them.
   *
   * One action covers both because they are the same promotion at different
   * scales: "WELCOME10, unlimited" and "50 single-use codes for the Christmas
   * market" differ only in `count` and `maxRedemptions`. A custom code (typed
   * by the merchant, e.g. a word they are printing on a flyer) is only allowed
   * for a batch of one — fifty codes cannot all be called SPRING.
   */
  create: tenantAdminProcedure
    .input(
      termsInput.extend({
        /** Merchant-chosen code. Omitted → generated. */
        code: z.string().trim().max(MAX_DISCOUNT_CODE_LENGTH).optional(),
        count: z.number().int().min(1).max(MAX_BATCH_SIZE).default(1),
        /** Prefix for generated codes, e.g. "FRIENDS" → FRIENDS-7K3P9QME. */
        prefix: z.string().trim().max(16).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSaneTerms(input);

      const custom = normaliseDiscountCode(input.code ?? "");
      if (custom && input.count > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A code you choose yourself can only be created one at a time. " +
            "Use a prefix to generate a batch.",
        });
      }

      // A fixed amount is denominated in the store's own currency — the same
      // one checkout charges in — so the two can never disagree about what
      // "10 off" means.
      const settings = await getTenantSettings(ctx.tenant.id);
      const currency = (settings?.currency || "chf").toLowerCase();

      const codes = custom
        ? [custom]
        : input.count > 1
          ? generateDiscountCodes(input.count, {
              prefix: input.prefix,
              length: DEFAULT_DISCOUNT_CODE_LENGTH,
            })
          : [
              generateDiscountCode({
                prefix: input.prefix,
                length: DEFAULT_DISCOUNT_CODE_LENGTH,
              }),
            ];

      // A merchant re-using a word they already used would otherwise surface as
      // a raw MySQL duplicate-key 500. Generated codes can't realistically
      // collide, but the check costs one query and covers both.
      for (const code of codes) {
        const existing = await getDiscountCodeByCode(ctx.tenant.id, code);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `The code ${code} already exists in this store.`,
          });
        }
      }

      await createDiscountCodes(
        codes.map((code) => ({
          tenantId: ctx.tenant.id,
          code,
          kind: input.kind,
          value: input.value,
          currency: input.kind === "amount" ? currency : null,
          campaign: input.campaign ?? null,
          minSubtotalRappen: input.minSubtotalRappen ?? null,
          maxRedemptions: input.maxRedemptions ?? null,
          startsAt: input.startsAt ?? null,
          expiresAt: input.expiresAt ?? null,
          // tenantAdminProcedure has already refused a null user; the `?? null`
          // is the compiler's share of that, not a real branch.
          createdBy: ctx.user?.id ?? null,
        })),
      );

      return { codes };
    }),

  /**
   * Admin: change a code's terms or switch it off.
   *
   * `code`, `kind` and `value` are deliberately absent: a code already in a
   * customer's inbox must keep meaning what it said when it was sent. Turning
   * it off, moving its end date or raising its limit are all fine; quietly
   * turning 20% into 5% is not.
   */
  update: tenantAdminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        campaign: z.string().trim().max(64).nullable().optional(),
        maxRedemptions: z.number().int().positive().nullable().optional(),
        minSubtotalRappen: z.number().int().min(0).nullable().optional(),
        startsAt: z.coerce.date().nullable().optional(),
        expiresAt: z.coerce.date().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      if (
        patch.startsAt &&
        patch.expiresAt &&
        patch.expiresAt <= patch.startsAt
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The end date has to come after the start date.",
        });
      }
      const updated = await updateDiscountCode(ctx.tenant.id, id, patch);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Code not found" });
      }
      return { success: true } as const;
    }),

  /**
   * Admin: delete a code that was never used. A code WITH redemptions is kept
   * — last month's orders point at it, and a merchant reading their books needs
   * to see which promotion paid for what. Deactivation is the answer there, and
   * the message says so rather than leaving the button looking broken.
   */
  delete: tenantAdminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await getDiscountCodes(ctx.tenant.id);
      const row = rows.find((r) => r.id === input.id);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Code not found" });
      }
      if (row.redeemedCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This code has already been used, so it can't be deleted — " +
            "switch it off instead and it will stop working immediately.",
        });
      }
      await deleteDiscountCode(ctx.tenant.id, input.id);
      return { success: true } as const;
    }),

  /** Admin: who redeemed one code, and for how much. */
  redemptions: tenantAdminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await getDiscountRedemptions(ctx.tenant.id, input.id);
      return rows.map((row) => ({
        id: row.id,
        amountOffRappen: row.amountOffRappen,
        currency: row.currency,
        customerEmail: row.customerEmail,
        confirmedAt: row.confirmedAt?.toISOString() ?? null,
      }));
    }),

  /**
   * Public: what this code would take off this basket — the answer the basket
   * shows while the shopper is still deciding.
   *
   * The subtotal comes from the store's own product rows, never from the
   * request, so this preview and the charge agree by construction. Unavailable
   * pieces are simply not counted: a basket the shopper is about to be told to
   * fix should not also get a wrong discount figure.
   */
  check: publicProcedure
    .input(
      z.object({
        code: z.string().trim().max(MAX_DISCOUNT_CODE_LENGTH),
        productIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(MAX_CHECKOUT_ITEMS),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      const gate = await codeCheckLimiter.check(
        `discount-check:${ctx.req?.ip ?? "unknown"}`,
      );
      if (!gate.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many attempts. Try again in ${gate.retryAfterSeconds} seconds.`,
        });
      }

      const code = normaliseDiscountCode(input.code);
      // A code we have never heard of gets one flat sentence, and no hint of
      // whether it was close to anything. A code that DOES exist gets the real
      // reason (below) — every one of those reasons is something its rightful
      // holder needs in order to act, and the defence against a guesser is the
      // 40 bits in a generated code plus the rate limit above, not coyness
      // about a promotion that has already ended.
      const unknownCode = {
        valid: false as const,
        message: "That discount code isn't valid for this basket.",
      };
      if (!code) return unknownCode;

      const row = await getDiscountCodeByCode(ctx.tenant.id, code);
      if (!row) return unknownCode;

      const settings = await getTenantSettings(ctx.tenant.id);
      const currency = (settings?.currency || "chf").toLowerCase();

      const uniqueIds = Array.from(new Set(input.productIds));
      const items = await getProductsByIds(ctx.tenant.id, uniqueIds);
      const subtotalRappen = items
        .filter((p) => !p.sold && p.visible && p.quantity > 0)
        .reduce((sum, p) => sum + Math.round(Number(p.price) * 100), 0);

      const result = evaluateDiscount({
        terms: row,
        subtotalRappen,
        currency,
      });
      if (!result.ok) {
        // "You need CHF 20 more", "this ended on Sunday", "this one has been
        // used" — the shopper can do something about each of these, and a flat
        // "not valid" would send them to the merchant's inbox instead.
        return { valid: false as const, message: result.message };
      }

      return {
        valid: true as const,
        code: row.code,
        amountOffRappen: result.amountOffRappen,
        subtotalRappen,
        currency,
        description: describeDiscount(row),
      };
    }),
});
