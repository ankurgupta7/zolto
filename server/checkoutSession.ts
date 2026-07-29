/**
 * Storefront checkout — the shared service behind every online sale.
 *
 * One implementation, two front doors: the storefront's own cart
 * (`checkout.createSession` in routers/checkout.ts) and AI agents buying over
 * MCP (`create_checkout` in mcp.ts). They differ only in the `channel` they
 * record, so an agent-originated order gets exactly the same inventory hold,
 * shipping rules, platform fee, and Stripe treatment as a human's — the
 * agent layer is a new doorway, not a parallel checkout with its own rules.
 *
 * Money never touches Zolto: the session is created on the tenant's own
 * connected Standard account (a direct charge), and Zolto's cut rides along
 * as a Stripe `application_fee_amount` — 1% of the product subtotal on the
 * Free plan, nothing on Pro (docs/planning/pricing-pivot-agent-commerce.md).
 */

import { PLANS, REVENUE_SHARE } from "@shared/platform";
import type { Tenant } from "../drizzle/schema";
import {
  createOrder,
  getProductsByIds,
  getTenantSettings,
  releaseProductReservations,
  reserveProducts,
  PRODUCT_RESERVATION_TTL_MS,
} from "./db";
import { getStripe } from "./stripe";

/** We ship within Switzerland and the EU. */
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
export const SHIPPING_COUNTRIES = ["CH", ...EU_COUNTRIES] as const;

// Shipping is free within Switzerland for orders at or above this subtotal
// (in Rappen), otherwise a flat fee applies. EU shipping is always flat —
// no free-shipping threshold there.
const FREE_SHIPPING_THRESHOLD_RAPPEN = 5000; // CHF 50.00
const CH_FLAT_SHIPPING_FEE_RAPPEN = 800; // CHF 8.00
const EU_FLAT_SHIPPING_FEE_RAPPEN = 1500; // CHF 15.00

/** Most pieces one checkout may contain, shared by every front door. */
export const MAX_CHECKOUT_ITEMS = 50;

/** Sales channel recorded on the order. In-person lives in posOrders. */
export type SalesChannel = "web" | "agent";

/**
 * Why a checkout could not be created. Callers map these to their own
 * error shape (tRPC codes, MCP tool errors) — the service stays transport
 * agnostic so both front doors report the same reasons.
 */
export type CheckoutErrorCode =
  | "NOT_CONFIGURED" // Zolto's own Stripe key is missing
  | "NOT_CONNECTED" // this tenant hasn't linked their Stripe account yet
  | "NOT_FOUND" // one or more ids aren't in this store's catalogue
  | "CONFLICT"; // sold, hidden, or already being bought by someone else

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

/**
 * Zolto's platform fee on ONLINE + AGENT-originated orders. Computed on the
 * product subtotal only — never on shipping — and in-person POS sales never
 * carry a fee at all (server/pos.ts). An unknown plan value bills like Free,
 * matching the DB default.
 */
export function platformFeeRappen(
  plan: string,
  subtotalRappen: number,
): number {
  const bps =
    PLANS.find((p) => p.id === plan)?.onlineFeeBps ?? REVENUE_SHARE.freeBps;
  return Math.round((subtotalRappen * bps) / 10_000);
}

export interface CreateCheckoutResult {
  url: string;
  sessionId: string;
  amountTotal: number;
  currency: string;
  /** What Zolto took from this order, in Rappen (0 on Pro). */
  platformFeeRappen: number;
  items: { id: number; name: string; price: string }[];
}

/**
 * Create a Stripe Checkout Session for specific pieces in one store.
 *
 * Reserves the pieces for the session's lifetime so the POS terminal (or a
 * second buyer) can't sell the same one-of-a-kind item mid-payment, and
 * releases them again if Stripe or the DB fails afterwards.
 */
export async function createStorefrontCheckoutSession(params: {
  tenant: Tenant;
  productIds: number[];
  channel: SalesChannel;
  /** Absolute base URL for the success/cancel redirects. */
  baseUrl: string;
}): Promise<CreateCheckoutResult> {
  const { tenant, channel, baseUrl } = params;

  const stripe = getStripe();
  if (!stripe) {
    throw new CheckoutError(
      "NOT_CONFIGURED",
      "Online payment is not configured. Please enquire via WhatsApp.",
    );
  }

  // We never process a tenant's customer payments through Zolto's own
  // account. See server/stripeConnect.ts.
  const connectedAccountId = tenant.stripeConnectedAccountId;
  if (!connectedAccountId) {
    throw new CheckoutError(
      "NOT_CONNECTED",
      "This store hasn't connected online payments yet. Please enquire via WhatsApp.",
    );
  }

  const tenantId = tenant.id;

  // Prices and shipping are charged in the tenant's own currency
  // (tenantSettings.currency; multi-currency is a Pro plan feature, gated in
  // tenant.updateSettings). Stripe wants lowercase ISO.
  const tenantSettings = await getTenantSettings(tenantId);
  const currency = (tenantSettings?.currency || "chf").toLowerCase();

  // De-duplicate — each piece is unique and can only be bought once.
  const uniqueIds = Array.from(new Set(params.productIds));
  const items = await getProductsByIds(tenantId, uniqueIds);

  const found = new Set(items.map((p) => p.id));
  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new CheckoutError(
      "NOT_FOUND",
      `Some pieces are no longer available (IDs: ${missing.join(", ")}).`,
    );
  }

  const unavailable = items.filter(
    (p) => p.sold || !p.visible || p.quantity <= 0,
  );
  if (unavailable.length > 0) {
    throw new CheckoutError(
      "CONFLICT",
      `Already sold: ${unavailable.map((p) => p.name).join(", ")}. Please remove them from your bag.`,
    );
  }

  // POS <-> online inventory sync: hold these pieces for the lifetime of the
  // Checkout Session. See server/db.ts reserveProducts.
  const failedToReserve = await reserveProducts(tenantId, uniqueIds);
  if (failedToReserve.length > 0) {
    // Give back whatever DID get reserved in this same batch — we're not
    // proceeding, so nothing should stay held.
    const reservedIds = uniqueIds.filter((id) => !failedToReserve.includes(id));
    await releaseProductReservations(tenantId, reservedIds);
    const names = items
      .filter((p) => failedToReserve.includes(p.id))
      .map((p) => p.name);
    throw new CheckoutError(
      "CONFLICT",
      `Someone else is already buying: ${names.join(", ")}. Please remove them from your bag or try again shortly.`,
    );
  }

  const lineItems = items.map((p) => {
    const images =
      p.imageUrl && /^https?:\/\//.test(p.imageUrl) ? [p.imageUrl] : undefined;
    return {
      quantity: 1,
      price_data: {
        currency,
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

  const subtotalRappen = items.reduce(
    (sum, p) => sum + Math.round(Number(p.price) * 100),
    0,
  );
  const chShippingFeeRappen =
    subtotalRappen >= FREE_SHIPPING_THRESHOLD_RAPPEN
      ? 0
      : CH_FLAT_SHIPPING_FEE_RAPPEN;

  const feeRappen = platformFeeRappen(tenant.plan, subtotalRappen);

  // The second argument's `stripeAccount` runs this call on the tenant's own
  // connected Standard account (a "direct charge") using Zolto's platform key
  // — funds settle straight to the tenant, no raw tenant Stripe key ever
  // touches Zolto's servers. application_fee_amount is the platform's cut of
  // that direct charge; omitted entirely when the fee is 0 (Pro plan).
  //
  // Wrapped so a Stripe/DB failure after the reservation above doesn't leave
  // a phantom hold on these pieces until it times out on its own.
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
        // Stripe Checkout shows every option to every customer regardless of
        // the address they enter — it doesn't filter shipping_options by
        // destination country within a single session config. The customer
        // picks the option matching their own country from the two labeled
        // choices below; this is the standard workaround for per-country flat
        // rates without a custom shipping-rate lookup.
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: chShippingFeeRappen, currency },
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
              fixed_amount: { amount: EU_FLAT_SHIPPING_FEE_RAPPEN, currency },
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
        // top-level statement_descriptor is rejected by newer Stripe APIs.
        payment_intent_data: {
          statement_descriptor: (tenant.name || "ZOLTO STORE")
            .slice(0, 22)
            .toUpperCase(),
          ...(feeRappen > 0 ? { application_fee_amount: feeRappen } : {}),
        },
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/checkout/cancel`,
        metadata: { productIds: uniqueIds.join(","), channel },
        // Matches the reservation TTL above (30 min, Stripe's own minimum for
        // expires_at) so the hold on these pieces never outlives the session
        // that placed it.
        expires_at: Math.floor(
          (Date.now() + PRODUCT_RESERVATION_TTL_MS) / 1000,
        ),
      },
      { stripeAccount: connectedAccountId },
    );

    const amountTotal = session.amount_total ?? subtotalRappen;

    await createOrder({
      tenantId,
      stripeSessionId: session.id,
      status: "pending",
      amountTotal,
      currency,
      productIds: uniqueIds.join(","),
      channel,
      platformFeeRappen: feeRappen,
    });

    return {
      url: session.url as string,
      sessionId: session.id,
      amountTotal,
      currency,
      platformFeeRappen: feeRappen,
      items: items.map((p) => ({ id: p.id, name: p.name, price: p.price })),
    };
  } catch (err) {
    await releaseProductReservations(tenantId, uniqueIds).catch(() => {});
    throw err;
  }
}
