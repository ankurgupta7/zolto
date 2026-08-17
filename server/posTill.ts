/**
 * The web till — taking payment from a browser instead of a native app.
 *
 * A merchant who wants to take cards on an iPhone with our own app has to pay
 * Apple: Tap to Pay on iPhone needs the managed
 * `proximity-reader.payment.acceptance` entitlement, which is granted only to a
 * paid Developer Program team, and a free Apple account signs builds that
 * expire after seven days. A browser needs no entitlement, no certificate and
 * no store, so this runs on whatever phone is already at the counter.
 *
 * Three ways to be paid, settling through three different rails:
 *
 *   card       Stripe Checkout Session. The till draws the session URL as a QR,
 *              the customer pays on their own phone, Stripe tells us.
 *   twint_qr   The merchant's OWN TWINT QR sticker. Money moves merchant↔TWINT;
 *              Stripe never sees it, so nothing can confirm it automatically
 *              and the cashier attests to it. Uses the payment method that
 *              already exists for the native apps — see ATTESTED_METHODS in
 *              pos.ts — so the two clients record the same sale the same way.
 *   cash       As it ever was.
 *
 * Only the first is an online card payment and pays online card fees. The
 * second pays TWINT's own percentage and nothing to Stripe, which is why it is
 * worth a button of its own rather than being folded into the card one.
 *
 * Every Stripe call is made on the tenant's connected account when they have
 * one, exactly as the Terminal and TWINT endpoints in pos.ts do, so the money
 * lands with the merchant and not the platform.
 */

import type Stripe from "stripe";
import {
  getDb,
  getPosOrderById,
  getTenantSettings,
  markProductsSold,
} from "./db";
import { getStripe } from "./stripe";
import {
  createPosOrder,
  failPosCheckoutSession,
  fulfillPosCheckoutSession,
  resolveSaleLineItems,
} from "./pos";

/** Methods the till settles on the cashier's word, with no Stripe leg. */
export const TILL_ATTESTED_METHODS = ["cash", "twint_qr"] as const;
export type TillAttestedMethod = (typeof TILL_ATTESTED_METHODS)[number];

export interface TillCartInput {
  productIds?: number[];
  allowHidden?: boolean;
  priceOverrides?: Record<string, number>;
  customItems?: { name: string; priceRappen: number }[];
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

/** Who is selling, and where the money goes. */
export interface TillTenant {
  tenantId: number;
  stripeConnectedAccountId?: string | null;
}

export type TillResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number; error: string };

/**
 * How long a till QR stays payable. Stripe's floor is 30 minutes, which is also
 * the right answer at a counter: long enough for a customer fumbling with a
 * banking app, short enough that a photographed code is not a standing
 * invitation to pay later at a price that has since changed.
 */
const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60;

function resolveBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production"
    ? "https://zolto.ch"
    : "http://localhost:3000";
}

/**
 * Creates the Stripe Checkout Session behind the till's scan-to-pay QR, and the
 * pending order it will fulfil.
 *
 * The order is written AFTER the session so it can carry the session id, which
 * is the only handle fulfilment has: an open session has no PaymentIntent at
 * all. If the order write fails the session is left to expire on its own —
 * harmless, since nothing can be fulfilled without a matching row.
 */
export async function createTillCheckoutSession(
  tenant: TillTenant,
  input: TillCartInput,
  now: Date = new Date(),
): Promise<
  TillResult<{
    url: string;
    checkoutSessionId: string;
    posOrderId: number;
    totalRappen: number;
  }>
> {
  const stripe = getStripe();
  const db = await getDb();
  if (!stripe)
    return { ok: false, status: 503, error: "Stripe not configured" };
  if (!db) return { ok: false, status: 503, error: "Database unavailable" };

  const resolved = await resolveSaleLineItems(db, tenant.tenantId, input);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error };
  }
  const { lineItems, totalRappen, description } = resolved;

  // Same direct-charge pattern as /api/pos/payment-intent: when the merchant
  // has connected their own Stripe account the sale is created ON that account,
  // so the money lands with them just like their online orders.
  const stripeOpts = tenant.stripeConnectedAccountId
    ? { stripeAccount: tenant.stripeConnectedAccountId }
    : undefined;
  const currency = (
    (await getTenantSettings(tenant.tenantId))?.currency || "chf"
  ).toLowerCase();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // Ad-hoc prices: a till sale is a one-off, and creating a catalogue Price
      // per sale would fill the merchant's Stripe dashboard with single-use
      // junk they never asked for.
      line_items: lineItems.map((item) => ({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: item.priceRappen,
          product_data: { name: item.displayName },
        },
      })),
      expires_at:
        Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
      success_url: `${resolveBaseUrl()}/pos/paid`,
      cancel_url: `${resolveBaseUrl()}/pos/cancelled`,
      payment_intent_data: {
        // Names what was sold, so the merchant's payment list shows more than
        // an amount — the same reason the Terminal path sets it.
        description,
      },
      customer_email: input.customerEmail || undefined,
      metadata: {
        source: "web_till",
        tenantId: String(tenant.tenantId),
        productIds: (Array.isArray(input.productIds)
          ? input.productIds
          : []
        ).join(","),
      },
    },
    stripeOpts,
  );

  if (!session.url) {
    console.error(`[POS] Checkout session ${session.id} came back with no url`);
    return {
      ok: false,
      status: 502,
      error: "Stripe did not return a payment URL",
    };
  }

  const posOrderId = await createPosOrder(db, tenant.tenantId, {
    stripePaymentIntentId: null,
    stripeCheckoutSessionId: session.id,
    status: "pending",
    paymentMethod: "card",
    totalRappen,
    lineItems,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
  });

  return {
    ok: true,
    url: session.url,
    checkoutSessionId: session.id,
    posOrderId,
    totalRappen,
  };
}

/**
 * Records a sale the cashier attests to — cash counted, or a TWINT payment the
 * merchant watched land in their own app after the customer scanned their
 * sticker. No asynchronous confirmation exists for either, so the order is
 * written paid and stock decremented immediately.
 */
export async function recordTillAttestedSale(
  tenant: TillTenant,
  method: TillAttestedMethod,
  input: TillCartInput,
): Promise<TillResult<{ posOrderId: number; totalRappen: number }>> {
  const db = await getDb();
  if (!db) return { ok: false, status: 503, error: "Database unavailable" };

  const resolved = await resolveSaleLineItems(db, tenant.tenantId, input);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error };
  }
  const { lineItems, totalRappen } = resolved;

  const posOrderId = await createPosOrder(db, tenant.tenantId, {
    stripePaymentIntentId: null,
    status: "paid",
    paymentMethod: method,
    totalRappen,
    lineItems,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
  });

  await markProductsSold(
    tenant.tenantId,
    lineItems.map((i) => i.productId).filter((id): id is number => id !== null),
  );

  return { ok: true, posOrderId, totalRappen };
}

export interface TillOrderStatus {
  posOrderId: number;
  status: "pending" | "paid" | "failed";
  totalRappen: number;
  paymentMethod: string;
}

/**
 * What the till polls while its QR is on screen.
 *
 * It does not simply read our own row. If the order is still pending it asks
 * Stripe directly and fulfils on the spot when Stripe says the session is paid,
 * so the till works on a deployment where nobody enabled
 * `checkout.session.completed` on the webhook endpoint. The webhook stays the
 * fast path; this is the one that cannot silently not exist.
 *
 * The order is looked up within the caller's tenant, so one merchant cannot
 * poll — or trigger fulfilment of — another's sale by guessing an id.
 */
export async function getTillOrderStatus(
  tenant: TillTenant,
  posOrderId: number,
): Promise<TillResult<TillOrderStatus>> {
  const order = await getPosOrderById(tenant.tenantId, posOrderId);
  if (!order) return { ok: false, status: 404, error: "Order not found" };

  if (order.status === "paid" || !order.stripeCheckoutSessionId) {
    return {
      ok: true,
      posOrderId: order.id,
      status: order.status,
      totalRappen: order.totalRappen,
      paymentMethod: order.paymentMethod,
    };
  }

  const stripe = getStripe();
  const db = await getDb();
  if (stripe && db) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        order.stripeCheckoutSessionId,
        undefined,
        tenant.stripeConnectedAccountId
          ? { stripeAccount: tenant.stripeConnectedAccountId }
          : undefined,
      );
      if (session.payment_status === "paid") {
        await fulfillPosCheckoutSession(db, session as Stripe.Checkout.Session);
        return {
          ok: true,
          posOrderId: order.id,
          status: "paid",
          totalRappen: order.totalRappen,
          paymentMethod: order.paymentMethod,
        };
      }
      if (session.status === "expired") {
        // The QR went unscanned for its full 30 minutes. Say so, so the till
        // stops waiting and the row stops looking like a sale in progress.
        await failPosCheckoutSession(db, session as Stripe.Checkout.Session);
        return {
          ok: true,
          posOrderId: order.id,
          status: "failed",
          totalRappen: order.totalRappen,
          paymentMethod: order.paymentMethod,
        };
      }
    } catch (err) {
      // A poll that can't reach Stripe is not a failed sale — the till should
      // keep waiting, and the webhook may well land first anyway.
      console.warn(
        `[POS] Could not check checkout session for order ${order.id}:`,
        err,
      );
    }
  }

  return {
    ok: true,
    posOrderId: order.id,
    status: order.status,
    totalRappen: order.totalRappen,
    paymentMethod: order.paymentMethod,
  };
}
