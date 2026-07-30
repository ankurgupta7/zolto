import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import {
  getProductsByIds,
  getOrderBySessionId,
  getPaidOrders,
  getTenantById,
} from "../db";
import { fulfillOrder, getStripe, isStripeConfigured } from "../stripe";
import {
  CheckoutError,
  createStorefrontCheckoutSession,
  MAX_CHECKOUT_ITEMS,
  type CheckoutErrorCode,
} from "../checkoutSession";

// ─── Checkout router ────────────────────────────────────────────────────────

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

/** Checkout failures are transport-agnostic; map them to tRPC codes here. */
const TRPC_CODE: Record<
  CheckoutErrorCode,
  "PRECONDITION_FAILED" | "NOT_FOUND" | "CONFLICT"
> = {
  NOT_CONFIGURED: "PRECONDITION_FAILED",
  NOT_CONNECTED: "PRECONDITION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
};

export const checkoutRouter = router({
  // Public: whether online payment is available for THIS storefront (controls
  // UI fallback to WhatsApp). Requires both the platform's own Stripe key
  // (isStripeConfigured) and this tenant having linked their own Connect
  // account — a tenant that hasn't connected yet falls back to WhatsApp too.
  config: publicProcedure.query(({ ctx }) => ({
    enabled:
      isStripeConfigured() && Boolean(ctx.tenant?.stripeConnectedAccountId),
  })),

  // Public: create a Stripe Checkout Session for the given pieces. The heavy
  // lifting lives in ../checkoutSession so the storefront cart and AI agents
  // buying over MCP produce identical orders.
  createSession: publicProcedure
    .input(
      z.object({
        productIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(MAX_CHECKOUT_ITEMS),
        // Sales-channel attribution: "agent" when the cart was assembled by
        // an AI agent (store chat), "web" for the normal storefront. Both are
        // "online" for fee purposes; the split feeds the pivot's north-star
        // metric (vendors with >= 1 online/agent sale per month).
        channel: z.enum(["web", "agent"]).default("web"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Checkout is scoped to the storefront's tenant — a cart can only ever
      // contain that store's pieces.
      if (!ctx.tenant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      try {
        const result = await createStorefrontCheckoutSession({
          tenant: ctx.tenant,
          productIds: input.productIds,
          channel: input.channel,
          baseUrl: resolveBaseUrl(),
        });
        return { url: result.url, sessionId: result.sessionId };
      } catch (err) {
        if (err instanceof CheckoutError) {
          throw new TRPCError({
            code: TRPC_CODE[err.code],
            message: err.message,
          });
        }
        throw err;
      }
    }),

  // Admin: list this store's paid online orders (newest first) for the admin
  // Orders page. Each order's comma-separated productIds are resolved to piece
  // names so the UI can show what sold without a second round-trip. Scoped to
  // the caller's own tenant — an admin only ever sees their store's orders.
  listOrders: adminProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(200).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.tenantId;
      const rows = await getPaidOrders(tenantId, input?.limit ?? 100);

      // Resolve all referenced product ids in one query, then map per order.
      const allIds = Array.from(
        new Set(
          rows.flatMap((o) =>
            o.productIds
              .split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n)),
          ),
        ),
      );
      const products = allIds.length
        ? await getProductsByIds(tenantId, allIds)
        : [];
      const nameById = new Map(products.map((p) => [p.id, p.name]));

      return rows.map((o) => ({
        id: o.id,
        status: o.status,
        amountTotal: o.amountTotal,
        currency: o.currency,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
        items: o.productIds
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n))
          .map((id) => ({ id, name: nameById.get(id) ?? `#${id}` })),
      }));
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
