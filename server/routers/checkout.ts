import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import {
  getProductsByIds,
  createOrder,
  getOrderBySessionId,
  getTenantById,
  reserveProducts,
  releaseProductReservations,
  PRODUCT_RESERVATION_TTL_MS,
} from "../db";
import { fulfillOrder, getStripe, isStripeConfigured } from "../stripe";

// ─── Checkout router ────────────────────────────────────────────────────────

// We ship within Switzerland and the EU.
const EU_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
] as const;
const SHIPPING_COUNTRIES = ["CH", ...EU_COUNTRIES] as const;

// Shipping is free within Switzerland for orders at or above this subtotal
// (in Rappen), otherwise a flat fee applies. EU shipping is always flat —
// no free-shipping threshold there.
const FREE_SHIPPING_THRESHOLD_RAPPEN = 5000; // CHF 50.00
const CH_FLAT_SHIPPING_FEE_RAPPEN = 800; // CHF 8.00
const EU_FLAT_SHIPPING_FEE_RAPPEN = 1500; // CHF 15.00

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
  // Public: whether online payment is available for THIS storefront (controls
  // UI fallback to WhatsApp). Requires both the platform's own Stripe key
  // (isStripeConfigured) and this tenant having linked their own Connect
  // account — a tenant that hasn't connected yet falls back to WhatsApp too.
  config: publicProcedure.query(({ ctx }) => ({
    enabled:
      isStripeConfigured() && Boolean(ctx.tenant?.stripeConnectedAccountId),
  })),

  // Public: create a Stripe Checkout Session for the given pieces
  createSession: publicProcedure
    .input(
      z.object({
        productIds: z.array(z.number().int().positive()).min(1).max(50),
      }),
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

      // This store must have linked its own Stripe account (Connect) — we
      // never process a tenant's customer payments through Zolto's own
      // account. See server/stripeConnect.ts.
      const connectedAccountId = ctx.tenant.stripeConnectedAccountId;
      if (!connectedAccountId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This store hasn't connected online payments yet. Please enquire via WhatsApp.",
        });
      }

      // De-duplicate — each piece is unique and can only be bought once.
      const uniqueIds = Array.from(new Set(input.productIds));
      const items = await getProductsByIds(tenantId, uniqueIds);

      const found = new Set(items.map((p) => p.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Some pieces are no longer available (IDs: ${missing.join(", ")}).`,
        });
      }

      const unavailable = items.filter(
        (p) => p.sold || !p.visible || p.quantity <= 0,
      );
      if (unavailable.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Already sold: ${unavailable.map((p) => p.name).join(", ")}. Please remove them from your bag.`,
        });
      }

      // POS <-> online inventory sync: hold these pieces for the lifetime of
      // the Checkout Session so the POS terminal (or a second online
      // checkout) can't sell the same one-of-a-kind piece while this
      // customer is paying. See server/db.ts reserveProducts.
      const failedToReserve = await reserveProducts(tenantId, uniqueIds);
      if (failedToReserve.length > 0) {
        // Give back whatever DID get reserved in this same batch — we're not
        // proceeding, so nothing should stay held.
        const reservedIds = uniqueIds.filter(
          (id) => !failedToReserve.includes(id),
        );
        await releaseProductReservations(tenantId, reservedIds);
        const names = items
          .filter((p) => failedToReserve.includes(p.id))
          .map((p) => p.name);
        throw new TRPCError({
          code: "CONFLICT",
          message: `Someone else is already buying: ${names.join(", ")}. Please remove them from your bag or try again shortly.`,
        });
      }

      const baseUrl = resolveBaseUrl();

      const lineItems = items.map((p) => {
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

      // Shipping: CH is free at/above the threshold, otherwise a flat fee.
      // EU is always a flat fee (no free-shipping threshold there).
      const subtotalRappen = items.reduce(
        (sum, p) => sum + Math.round(Number(p.price) * 100),
        0,
      );
      const chShippingFeeRappen =
        subtotalRappen >= FREE_SHIPPING_THRESHOLD_RAPPEN
          ? 0
          : CH_FLAT_SHIPPING_FEE_RAPPEN;

      // The second argument's `stripeAccount` runs this call on the tenant's
      // own connected Standard account (a "direct charge") using Zolto's
      // platform key — funds settle straight to the tenant, no application
      // fee, no raw tenant Stripe key ever touches Zolto's servers.
      //
      // Wrapped so a Stripe/DB failure after the reservation above doesn't
      // leave a phantom hold on these pieces until it times out on its own.
      try {
        const session = await stripe.checkout.sessions.create(
          {
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
            // Stripe Checkout shows every option to every customer regardless
            // of the address they enter — it doesn't filter shipping_options
            // by destination country within a single session config. The
            // customer picks the option matching their own country from the
            // two labeled choices below; this is the standard workaround for
            // per-country flat rates without a custom shipping-rate lookup.
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  fixed_amount: {
                    amount: chShippingFeeRappen,
                    currency: "chf",
                  },
                  display_name:
                    chShippingFeeRappen === 0
                      ? "Free shipping (Switzerland)"
                      : "Standard shipping (Switzerland)",
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: 2 },
                    maximum: { unit: "business_day", value: 3 },
                  },
                },
              },
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  fixed_amount: {
                    amount: EU_FLAT_SHIPPING_FEE_RAPPEN,
                    currency: "chf",
                  },
                  display_name: "Standard shipping (EU)",
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: 4 },
                    maximum: { unit: "business_day", value: 7 },
                  },
                },
              },
            ],
            phone_number_collection: { enabled: true },
            locale: "auto",
            // Controls the merchant name shown on TWINT and bank statements.
            // 22-char max. The Stripe account business profile name (on the
            // tenant's OWN connected account) also affects TWINT display.
            // NOTE: must be inside payment_intent_data for Checkout Sessions;
            // top-level statement_descriptor is rejected by newer Stripe API versions.
            payment_intent_data: {
              statement_descriptor: (ctx.tenant.name || "ZOLTO STORE")
                .slice(0, 22)
                .toUpperCase(),
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/checkout/cancel`,
            metadata: { productIds: uniqueIds.join(",") },
            // Matches the reservation TTL above (30 min, Stripe's own minimum
            // for expires_at) so the hold on these pieces never outlives the
            // session that placed it.
            expires_at: Math.floor(
              (Date.now() + PRODUCT_RESERVATION_TTL_MS) / 1000,
            ),
          },
          { stripeAccount: connectedAccountId },
        );

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
      } catch (err) {
        await releaseProductReservations(tenantId, uniqueIds).catch(() => {});
        throw err;
      }
    }),

  // Admin: manually re-trigger fulfillment for a Stripe session (e.g. missed webhook)
  fulfillSession: adminProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      if (!stripe)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Stripe not configured",
        });

      const order = await getOrderBySessionId(input.sessionId);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }
      // An admin may only re-trigger fulfillment for their own store's orders.
      if (order.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      const tenant = await getTenantById(order.tenantId);
      if (!tenant?.stripeConnectedAccountId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This store has no connected Stripe account",
        });
      }

      const session = await stripe.checkout.sessions.retrieve(
        input.sessionId,
        {},
        { stripeAccount: tenant.stripeConnectedAccountId },
      );
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
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      // Scope the product lookup to the order's own tenant.
      const products = await getProductsByIds(order.tenantId, productIds);

      const items = products.map((p) => ({
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
          const tenant = stripe ? await getTenantById(order.tenantId) : null;
          if (stripe && tenant?.stripeConnectedAccountId) {
            const session = await stripe.checkout.sessions.retrieve(
              input.sessionId,
              {},
              { stripeAccount: tenant.stripeConnectedAccountId },
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
