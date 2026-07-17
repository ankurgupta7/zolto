import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { getProductsByIds, createOrder, getOrderBySessionId } from "../db";
import { fulfillOrder, getStripe, isStripeConfigured } from "../stripe";

// ─── Checkout router ────────────────────────────────────────────────────────

// We ship within Switzerland only.
const SHIPPING_COUNTRIES = ["CH"] as const;

// Shipping is free for orders at or above this subtotal (in Rappen),
// otherwise a flat fee applies.
const FREE_SHIPPING_THRESHOLD_RAPPEN = 5000; // CHF 50.00
const FLAT_SHIPPING_FEE_RAPPEN = 200; // CHF 2.00

// Deliberately does NOT trust client-supplied origin (request body or Origin
// header) — those are attacker-controllable and would let a direct API
// caller redirect the post-payment flow (and leak the Stripe session id) to
// an arbitrary domain. Only a server-configured value is used.
function resolveBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production"
    ? "https://kalakosh.ch"
    : "http://localhost:3000";
}

export const checkoutRouter = router({
  // Public: whether online payment is available (controls UI fallback to WhatsApp)
  config: publicProcedure.query(() => ({ enabled: isStripeConfigured() })),

  // Public: create a Stripe Checkout Session for the given pieces
  createSession: publicProcedure
    .input(
      z.object({
        productIds: z.array(z.number().int().positive()).min(1).max(50),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      if (!stripe) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Online payment is not configured. Please enquire via WhatsApp.",
        });
      }

      // Checkout is scoped to the storefront's tenant — a cart can only ever
      // contain that store's pieces.
      if (!ctx.tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      const tenantId = ctx.tenant.id;

      // De-duplicate — each piece is unique and can only be bought once.
      const uniqueIds = Array.from(new Set(input.productIds));
      const items = await getProductsByIds(tenantId, uniqueIds);

      const found = new Set(items.map(p => p.id));
      const missing = uniqueIds.filter(id => !found.has(id));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Some pieces are no longer available (IDs: ${missing.join(", ")}).`,
        });
      }

      const unavailable = items.filter(
        p => p.sold || !p.visible || p.quantity <= 0
      );
      if (unavailable.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Already sold: ${unavailable.map(p => p.name).join(", ")}. Please remove them from your bag.`,
        });
      }

      const baseUrl = resolveBaseUrl();

      const lineItems = items.map(p => {
        const images =
          p.imageUrl && /^https?:\/\//.test(p.imageUrl)
            ? [p.imageUrl]
            : undefined;
        return {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: Math.round(Number(p.price) * 100),
            product_data: {
              name: p.name,
              description: p.description?.slice(0, 500) || undefined,
              ...(images ? { images } : {}),
              metadata: { productId: String(p.id) },
            },
          },
        };
      });

      // Shipping: free at/above the threshold, otherwise a flat fee (CH only).
      const subtotalRappen = items.reduce(
        (sum, p) => sum + Math.round(Number(p.price) * 100),
        0
      );
      const shippingFeeRappen =
        subtotalRappen >= FREE_SHIPPING_THRESHOLD_RAPPEN
          ? 0
          : FLAT_SHIPPING_FEE_RAPPEN;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Credit & debit cards plus TWINT (Swiss mobile payment)
        payment_method_types: ["card", "twint"],
        line_items: lineItems,
        // Without this, one-time "payment" mode sessions never create a
        // Stripe Customer, so the dashboard's Customers count stays at 0.
        customer_creation: "always",
        billing_address_collection: "required",
        shipping_address_collection: {
          allowed_countries: [...SHIPPING_COUNTRIES],
        },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: shippingFeeRappen, currency: "chf" },
              display_name:
                shippingFeeRappen === 0
                  ? "Free shipping (Switzerland)"
                  : "Standard shipping (Switzerland)",
              delivery_estimate: {
                minimum: { unit: "business_day", value: 2 },
                maximum: { unit: "business_day", value: 3 },
              },
            },
          },
        ],
        phone_number_collection: { enabled: true },
        locale: "auto",
        // Controls the merchant name shown on TWINT and bank statements.
        // 22-char max. The Stripe account business profile name also
        // affects TWINT display — make sure it is set to "Kalakosh".
        // NOTE: must be inside payment_intent_data for Checkout Sessions;
        // top-level statement_descriptor is rejected by newer Stripe API versions.
        payment_intent_data: {
          statement_descriptor: "KALAKOSH",
        },
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/cancel`,
        metadata: { productIds: uniqueIds.join(",") },
      });

      const amountTotal =
        session.amount_total ??
        items.reduce((sum, p) => sum + Math.round(Number(p.price) * 100), 0);

      await createOrder({
        tenantId,
        stripeSessionId: session.id,
        status: "pending",
        amountTotal,
        currency: "chf",
        productIds: uniqueIds.join(","),
      });

      return { url: session.url, sessionId: session.id };
    }),

  // Admin: manually re-trigger fulfillment for a Stripe session (e.g. missed webhook)
  fulfillSession: adminProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const stripe = getStripe();
      if (!stripe)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe not configured",
        });
      const session = await stripe.checkout.sessions.retrieve(input.sessionId);
      if (session.payment_status !== "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Session is not paid (status: ${session.payment_status})`,
        });
      }
      await fulfillOrder(session);
      return { success: true };
    }),

  // Public: poll an order's status after returning from Stripe Checkout
  orderStatus: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ input }) => {
      const order = await getOrderBySessionId(input.sessionId);
      if (!order) return null;

      const productIds = order.productIds
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n));
      // Scope the product lookup to the order's own tenant.
      const products = await getProductsByIds(order.tenantId, productIds);

      const items = products.map(p => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn ?? null,
        price: p.price,
        imageUrl: p.imageUrl ?? null,
      }));

      // For pending orders, ask Stripe directly rather than waiting for the
      // webhook to update the DB. Card payments are confirmed synchronously
      // by Stripe before the redirect, so the DB often lags by 1-2 seconds.
      let resolvedStatus = order.status;
      let customerEmail = order.customerEmail;
      let customerName = order.customerName;
      let paymentMethod = order.paymentMethod;

      if (order.status === "pending") {
        try {
          const stripe = getStripe();
          if (stripe) {
            const session = await stripe.checkout.sessions.retrieve(
              input.sessionId
            );
            if (session.payment_status === "paid") {
              resolvedStatus = "paid";
              customerEmail ??= session.customer_details?.email ?? null;
              customerName ??= session.customer_details?.name ?? null;
              paymentMethod ??= Array.isArray(session.payment_method_types)
                ? (session.payment_method_types[0] ?? null)
                : null;
            }
          }
        } catch {
          // Stripe unavailable — fall back to the DB status
        }
      }

      return {
        reference: order.id,
        status: resolvedStatus,
        amountTotal: order.amountTotal,
        currency: order.currency,
        customerEmail,
        customerName,
        paymentMethod,
        createdAt: order.createdAt.toISOString(),
        items,
      };
    }),
});
