/**
 * Stripe payment integration for Kalakosh Zurich
 *
 * Uses Stripe Checkout (hosted) so the customer is redirected to a secure,
 * PCI-compliant payment page that supports credit cards, debit cards and TWINT
 * (Switzerland's most popular mobile payment method). All prices are in CHF.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY       – Zolto's own (platform) secret API key
 *                             (sk_live_... or sk_test_...). Used for Zolto's
 *                             own subscription billing of tenants AND as the
 *                             platform key for Connect API calls — it never
 *                             directly processes a tenant's storefront
 *                             payments; see server/stripeConnect.ts for that.
 *   STRIPE_WEBHOOK_SECRET   – Signing secret for /api/stripe/webhook (events
 *                             on Zolto's own account)
 *
 * Optional (Stripe Connect — see server/stripeConnect.ts):
 *   STRIPE_CONNECT_CLIENT_ID        – Platform's Connect OAuth client id (ca_...)
 *   STRIPE_CONNECT_WEBHOOK_SECRET   – Signing secret for /api/stripe/connect-webhook
 *                                     (events on tenants' connected accounts)
 *
 * Optional:
 *   PUBLIC_BASE_URL         – Canonical site URL used for success/cancel redirects
 *                             (falls back to the request Origin if unset)
 *
 * If STRIPE_SECRET_KEY is not set, the checkout flow is disabled and the
 * frontend falls back to the WhatsApp enquiry path. If a tenant hasn't
 * connected their own Stripe account via Connect, their storefront falls
 * back the same way even when the platform key is set.
 */

import type { Express, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import {
  createOrder,
  getOrderBySessionId,
  getProductsByIds,
  markProductsSold,
  releaseProductReservations,
  updateOrderBySessionId,
} from "./db";
import { sendOrderReceipt } from "./_core/email";
import { notifyOwner } from "./_core/notification";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _stripe = new Stripe(key);
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Create a Stripe Customer for a new tenant so their subscription/billing can be
 * attached later. Returns the customer id, or null when Stripe isn't configured
 * (self-serve signup still works without billing wired up).
 */
export async function createStripeCustomer(params: {
  name?: string;
  email?: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const customer = await stripe.customers.create({
    name: params.name || undefined,
    email: params.email || undefined,
  });
  return customer.id;
}

/**
 * Fulfil a successfully paid Checkout Session: mark the order paid, flag the
 * purchased pieces as sold so they leave the shop, and notify the owner.
 * Idempotent — safe to call more than once for the same session.
 */
export async function fulfillOrder(
  session: Stripe.Checkout.Session,
): Promise<void> {
  let order = await getOrderBySessionId(session.id);

  if (!order) {
    // Session was created before order tracking was added, or createOrder failed.
    // Reconstruct the order from Stripe session metadata so fulfillment can proceed.
    const productIdsStr = (session.metadata as Record<string, string> | null)
      ?.productIds;
    if (!productIdsStr) {
      console.warn(
        `[Stripe] No order or productIds metadata for session ${session.id} — cannot fulfil`,
      );
      return;
    }
    console.info(
      `[Stripe] Reconstructing missing order for session ${session.id}`,
    );
    try {
      await createOrder({
        stripeSessionId: session.id,
        status: "pending",
        amountTotal: session.amount_total ?? 0,
        currency: session.currency ?? "chf",
        productIds: productIdsStr,
        customerEmail: session.customer_details?.email ?? null,
        customerName: session.customer_details?.name ?? null,
      });
    } catch (err) {
      console.error(
        `[Stripe] Failed to reconstruct order for session ${session.id}:`,
        err,
      );
      return;
    }
    order = await getOrderBySessionId(session.id);
    if (!order) {
      console.error(
        `[Stripe] Order still missing after reconstruction for session ${session.id}`,
      );
      return;
    }
  }

  if (order.status === "paid") return; // already fulfilled

  const productIds = order.productIds
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const paymentMethod = Array.isArray(session.payment_method_types)
    ? session.payment_method_types[0]
    : undefined;

  await updateOrderBySessionId(session.id, {
    status: "paid",
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    customerEmail:
      session.customer_details?.email ?? order.customerEmail ?? null,
    customerName: session.customer_details?.name ?? order.customerName ?? null,
    paymentMethod: paymentMethod ?? order.paymentMethod ?? null,
  });

  await markProductsSold(order.tenantId, productIds);

  const customerEmail =
    session.customer_details?.email ?? order.customerEmail ?? null;
  if (customerEmail) {
    const purchasedProducts = await getProductsByIds(
      order.tenantId,
      productIds,
    );
    sendOrderReceipt({
      to: customerEmail,
      customerName:
        session.customer_details?.name ?? order.customerName ?? null,
      orderRef: order.id,
      createdAt: order.createdAt,
      items: purchasedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn ?? null,
        price: p.price,
        imageUrl: p.imageUrl ?? null,
      })),
      amountTotal: order.amountTotal,
      paymentMethod: paymentMethod ?? null,
    }).catch((err) =>
      console.error("[Stripe] Customer receipt email failed:", err),
    );
  }

  const total = (order.amountTotal / 100).toFixed(2);
  await notifyOwner({
    title: "🛒 New order paid",
    content:
      `A new order has been paid via Stripe.\n` +
      `Amount: CHF ${total}\n` +
      `Customer: ${session.customer_details?.name ?? "—"} (${session.customer_details?.email ?? "—"})\n` +
      `Pieces: ${order.productIds}\n` +
      `Payment method: ${paymentMethod ?? "—"}\n` +
      `These pieces have been marked as sold.`,
  }).catch((err) => console.error("[Stripe] Owner notification failed:", err));
}

/**
 * POS <-> online inventory sync: give back the checkout hold (see
 * server/db.ts reserveProducts) placed on a session's pieces when that
 * session didn't end in a sale, so they become sellable again — at the POS
 * terminal or in a fresh online checkout — right away instead of waiting
 * out the reservation's own TTL.
 */
async function releaseHeldProducts(sessionId: string): Promise<void> {
  const order = await getOrderBySessionId(sessionId);
  if (!order) return;
  const productIds = order.productIds
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
  await releaseProductReservations(order.tenantId, productIds).catch((err) =>
    console.error(
      `[Stripe] Failed to release product hold for session ${sessionId}:`,
      err,
    ),
  );
}

/**
 * Shared event handling for both the platform webhook and the Connect
 * webhook below — a checkout.session.completed means the same thing
 * regardless of which Stripe account it came from, since the order row
 * already carries its own tenantId (set when the session was created).
 */
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      await fulfillOrder(event.data.object as Stripe.Checkout.Session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateOrderBySessionId(session.id, {
        status: "expired",
      }).catch(() => {});
      await releaseHeldProducts(session.id);
      break;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await updateOrderBySessionId(session.id, {
        status: "failed",
      }).catch(() => {});
      await releaseHeldProducts(session.id);
      break;
    }
    default:
      // Unhandled event types are acknowledged but ignored.
      break;
  }
}

/**
 * Registers the Stripe webhook routes. MUST be called before the global
 * express.json() body parser so the raw body is available for signature
 * verification.
 *
 * Two separate endpoints, because they're signed with two separate secrets
 * in the Stripe Dashboard:
 *   /api/stripe/webhook          — events on Zolto's own (platform) account
 *                                   (STRIPE_WEBHOOK_SECRET)
 *   /api/stripe/connect-webhook  — events on tenants' connected accounts
 *                                   (STRIPE_CONNECT_WEBHOOK_SECRET), e.g. a
 *                                   Kalakosh customer's checkout completing.
 *                                   [PLACEHOLDER — register this endpoint in
 *                                   the Stripe Dashboard's Connect webhook
 *                                   settings once a Connect app exists.]
 */
export function registerStripeWebhook(app: Express): void {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripe || !webhookSecret) {
        console.warn("[Stripe] Webhook received but Stripe is not configured");
        res.status(400).send("Stripe not configured");
        return;
      }

      const signature = req.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          signature as string,
          webhookSecret,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Stripe] Webhook signature verification failed:", msg);
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      try {
        await handleStripeEvent(event);
      } catch (err) {
        console.error(`[Stripe] Error handling ${event.type}:`, err);
        res.status(500).send("Webhook handler failed");
        return;
      }

      res.json({ received: true });
    },
  );

  app.post(
    "/api/stripe/connect-webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const stripe = getStripe();
      const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
      if (!stripe || !webhookSecret) {
        console.warn(
          "[Stripe] Connect webhook received but Connect is not configured",
        );
        res.status(400).send("Stripe Connect not configured");
        return;
      }

      const signature = req.headers["stripe-signature"];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          signature as string,
          webhookSecret,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          "[Stripe] Connect webhook signature verification failed:",
          msg,
        );
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      try {
        await handleStripeEvent(event);
      } catch (err) {
        console.error(`[Stripe] Error handling Connect ${event.type}:`, err);
        res.status(500).send("Webhook handler failed");
        return;
      }

      res.json({ received: true });
    },
  );
}
