/**
 * The web till's API.
 *
 * Behind `tenantAdminProcedure`, not the `x-pos-key` header the native apps
 * use. A shared key baked into an app bundle is one thing; the same key shipped
 * to a browser is readable by anyone who opens devtools, and it would authorise
 * selling that store's inventory. The till runs inside an admin session that
 * already exists, and `tenantAdminProcedure` additionally proves the caller
 * administers *this* store rather than merely being an admin somewhere.
 *
 * The sale logic is shared with the native path (`server/posTill.ts` →
 * `server/pos.ts`), so a cart priced at the web till and one priced in the app
 * cannot drift.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantAdminProcedure } from "../_core/trpc";
import { getAllProducts, getTenantSettings } from "../db";
import { renderQrDataUrl } from "../qr";
import {
  createTillCheckoutSession,
  getTillOrderStatus,
  recordTillAttestedSale,
  type TillCartInput,
  type TillResult,
  type TillTenant,
} from "../posTill";

const cartInput = z.object({
  productIds: z.array(z.number().int().positive()).default([]),
  allowHidden: z.boolean().default(false),
  // Keyed by product id as a string — JSON object keys can't be numbers, and
  // this matches the shape the native apps already send.
  priceOverrides: z.record(z.string(), z.number().int().min(0)).default({}),
  customItems: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        priceRappen: z.number().int().min(0),
      }),
    )
    .default([]),
  customerName: z.string().max(255).optional(),
  customerEmail: z.string().email().max(320).optional(),
  customerPhone: z.string().max(32).optional(),
});

/**
 * Turns the shared layer's `{ ok: false, status }` into the tRPC error the
 * client expects, so a stale cart reads as "refresh and rebuild" rather than a
 * generic failure.
 */
function unwrap<T>(result: TillResult<T>): T {
  if (result.ok) return result;
  const code =
    result.status === 404
      ? "NOT_FOUND"
      : result.status === 409
        ? "CONFLICT"
        : result.status === 400 || result.status === 422
          ? "BAD_REQUEST"
          : "INTERNAL_SERVER_ERROR";
  throw new TRPCError({ code, message: result.error });
}

function toCartInput(input: z.infer<typeof cartInput>): TillCartInput {
  return {
    productIds: input.productIds,
    allowHidden: input.allowHidden,
    priceOverrides: input.priceOverrides,
    customItems: input.customItems,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
  };
}

function tenantOf(ctx: {
  tenant: { id: number; stripeConnectedAccountId?: string | null };
}): TillTenant {
  return {
    tenantId: ctx.tenant.id,
    stripeConnectedAccountId: ctx.tenant.stripeConnectedAccountId ?? null,
  };
}

export const tillRouter = router({
  /**
   * Everything this store can sell right now, priced in minor units so the till
   * never does float arithmetic on money. Sold and out-of-stock pieces are
   * never listed whatever `includeHidden` says — that is genuine
   * unavailability, not a display preference.
   */
  products: tenantAdminProcedure
    .input(
      z
        .object({ includeHidden: z.boolean().default(false) })
        .default({ includeHidden: false }),
    )
    .query(async ({ ctx, input }) => {
      const all = await getAllProducts(ctx.tenant.id);
      const settings = await getTenantSettings(ctx.tenant.id);
      const sellable = all.filter(
        (p) => !p.sold && p.quantity > 0 && (input.includeHidden || p.visible),
      );
      return {
        currency: (settings?.currency || "chf").toUpperCase(),
        // The till offers the direct-TWINT button only when the merchant has
        // actually uploaded their sticker; a button showing a blank square is
        // worse than no button.
        twintQrUrl: settings?.twintQrUrl ?? null,
        products: sellable.map((p) => ({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn ?? null,
          category: p.category,
          imageUrl: p.imageUrl ?? null,
          visible: p.visible,
          quantity: p.quantity,
          priceRappen: Math.round(Number(p.price) * 100),
        })),
      };
    }),

  /**
   * Card: opens a Stripe Checkout Session and hands back the URL rendered as a
   * QR. The sale is not recorded as paid here — `orderStatus` decides that,
   * once Stripe says the customer paid.
   */
  startCardPayment: tenantAdminProcedure
    .input(cartInput)
    .mutation(async ({ ctx, input }) => {
      const session = unwrap(
        await createTillCheckoutSession(tenantOf(ctx), toCartInput(input)),
      );
      // Rendered server-side so the till page needs no QR library, and so a
      // code that failed to render fails loudly here instead of leaving a blank
      // square in front of a waiting customer.
      return { ...session, qrDataUrl: await renderQrDataUrl(session.url) };
    }),

  /**
   * Cash, or TWINT paid straight to the merchant's own QR sticker. Both are
   * attested by the cashier, so both record as paid immediately. `card` is
   * deliberately not accepted here: it has to go through Stripe, and must not
   * be recordable as paid on a client's say-so.
   */
  recordAttestedSale: tenantAdminProcedure
    .input(cartInput.extend({ method: z.enum(["cash", "twint_qr"]) }))
    .mutation(async ({ ctx, input }) =>
      unwrap(
        await recordTillAttestedSale(
          tenantOf(ctx),
          input.method,
          toCartInput(input),
        ),
      ),
    ),

  /** Polled while the card QR is on screen. */
  orderStatus: tenantAdminProcedure
    .input(z.object({ posOrderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) =>
      unwrap(await getTillOrderStatus(tenantOf(ctx), input.posOrderId)),
    ),
});
