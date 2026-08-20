/**
 * Stripe payment integration for Kalakosh Zurich
 *
 * Uses Stripe Checkout (hosted) so the customer is redirected to a secure,
 * PCI-compliant payment page that supports credit cards, debit cards and TWINT
 * (Switzerland's most popular mobile payment method). All prices are in CHF.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY       – Gwinn's own (platform) secret API key
 *                             (sk_live_... or sk_test_...). Used for Gwinn's
 *                             own subscription billing of tenants AND as the
 *                             platform key for Connect API calls — it never
 *                             directly processes a tenant's storefront
 *                             payments; see server/stripeConnect.ts for that.
 *   STRIPE_WEBHOOK_SECRET   – Signing secret for /api/stripe/webhook (events
 *                             on Gwinn's own account)
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
  getTenantAdminContact,
  getTenantById,
  getTenantSettings,
  markProductsSold,
  releaseProductReservations,
  updateOrderBySessionId,
} from "./db";
import { confirmDiscountForSession } from "./discounts";
import { sendOrderReceipt, sendOwnerOrderEmail } from "./_core/email";
import { VERTICAL_PRESETS, isVertical } from "@shared/verticals";
import { notifyOwner } from "./_core/notification";
import { handleBillingEvent } from "./billing";
// Same shape of cycle as ./billing above (pos.ts imports getStripe from here):
// both sides are function declarations called at runtime, never at module load.
import { handlePosStripeEvent } from "./pos";

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

  // The discount hold placed when this session opened becomes a redemption that
  // actually happened. Idempotent (guarded on the `held` status), so Stripe's
  // webhook retries and the admin's manual re-fulfil button don't count twice —
  // and a no-op for the great majority of orders, which carry no code at all.
  await confirmDiscountForSession(session.id, {
    orderId: order.id,
    customerEmail:
      session.customer_details?.email ?? order.customerEmail ?? null,
  });

  const customerEmail =
    session.customer_details?.email ?? order.customerEmail ?? null;
  if (customerEmail) {
    const purchasedProducts = await getProductsByIds(
      order.tenantId,
      productIds,
    );
    // Receipt wording depends on what the store sells ("unworn" only makes
    // sense for wearables) — pull the vertical's returns sentence.
    const settings = await getTenantSettings(order.tenantId);
    const vertical =
      settings?.vertical && isVertical(settings.vertical)
        ? settings.vertical
        : "jewellery";
    const receiptTenant = await getTenantById(order.tenantId);
    sendOrderReceipt({
      branding: {
        ...(receiptTenant ? { tenantName: receiptTenant.name } : {}),
        returnsFooter: VERTICAL_PRESETS[vertical].returnsFooter,
      },
      to: customerEmail,
      customerName:
        session.customer_details?.name ?? order.customerName ?? null,
      orderRef: order.id,
      createdAt: order.createdAt,
      items: purchasedProducts.map((p) => ({
        id: p.id,
        name: p.name,
        nameEn: p.nameEn ?? null,
        nameDe: p.nameDe ?? null,
        nameFr: p.nameFr ?? null,
        nameIt: p.nameIt ?? null,
        price: p.price,
        imageUrl: p.imageUrl ?? null,
      })),
      amountTotal: order.amountTotal,
      paymentMethod: paymentMethod ?? null,
      // Receipt renders in the language the customer shopped in.
      locale: order.locale,
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

  // Task 8 (POS ↔ online inventory sync's sibling task, "order notifications"):
  // email the store's own admin, not just the platform's global Discord DM
  // above — the two can be different people once other tenants exist.
  const adminContact = await getTenantAdminContact(order.tenantId);
  if (adminContact?.email) {
    const tenant = await getTenantById(order.tenantId);
    const ownerProducts = await getProductsByIds(order.tenantId, productIds);
    sendOwnerOrderEmail({
      to: adminContact.email,
      ownerName: adminContact.name ?? tenant?.name ?? null,
      orderRef: order.id,
      amountTotal: order.amountTotal,
      customerName:
        session.customer_details?.name ?? order.customerName ?? null,
      customerEmail:
        session.customer_details?.email ?? order.customerEmail ?? null,
      paymentMethod: paymentMethod ?? null,
      items: ownerProducts.map((p) => ({
        name: p.name,
        nameEn: p.nameEn ?? null,
        price: p.price,
      })),
      branding: tenant ? { tenantName: tenant.name } : undefined,
    }).catch((err) => console.error("[Stripe] Owner order email failed:", err));
  }
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
async function handleStripeEvent(
  event: Stripe.Event,
  source: "platform" | "connect",
): Promise<void> {
  // Platform-billing events (plan subscriptions, photo-credit purchases,
  // subscription lifecycle) are handled by server/billing.ts first — but only
  // on the platform webhook; subscription events on a tenant's connected
  // account are not Gwinn's billing relationship. Anything billing doesn't
  // claim falls through to storefront order handling below.
  if (source === "platform" && (await handleBillingEvent(event))) return;

  // POS sales are fulfilled against `pos_orders`, not storefront `orders`, and
  // they reach this handler from BOTH endpoints: on the platform webhook when
  // the store has not connected its own Stripe account, and on the Connect
  // webhook when it has — the till and the native apps create their sessions
  // and PaymentIntents on whichever account the store is paid through.
  //
  // Asked before storefront handling, and on both sources, because passing a
  // till session to `fulfillOrder` does not merely fail to help: its recovery
  // path reconstructs a phantom storefront order from the `productIds` metadata
  // the till also sets, under DEFAULT_TENANT_ID, and sells that tenant's stock.
  // POS claims only what its own rows or the till's metadata prove is a POS
  // sale, so storefront sales fall straight through.
  if (await handlePosStripeEvent(event)) return;

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
 *   /api/stripe/webhook          — events on Gwinn's own (platform) account
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
        await handleStripeEvent(event, "platform");
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
        await handleStripeEvent(event, "connect");
      } catch (err) {
        console.error(`[Stripe] Error handling Connect ${event.type}:`, err);
        res.status(500).send("Webhook handler failed");
        return;
      }

      res.json({ received: true });
    },
  );
}
