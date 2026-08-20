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
 * Money never touches Gwinn: the session is created on the tenant's own
 * connected Standard account (a direct charge), and Gwinn's cut rides along
 * as a Stripe `application_fee_amount` — 1% of the product subtotal on the
 * Free plan, nothing on Pro (docs/planning/pricing-pivot-agent-commerce.md).
 */

import { BRAND } from "@shared/brand";
import { onlineFeeBpsFor, type TenantBillingFacts } from "@shared/entitlements";
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
import {
  claimDiscount,
  recordDiscountHold,
  releaseDiscountClaim,
  type ClaimedDiscount,
} from "./discounts";

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
  | "NOT_CONFIGURED" // ${BRAND.name}'s own Stripe key is missing
  | "NOT_CONNECTED" // this tenant hasn't linked their Stripe account yet
  | "NOT_FOUND" // one or more ids aren't in this store's catalogue
  | "CONFLICT" // sold, hidden, or already being bought by someone else
  | "DISCOUNT_REFUSED"; // the code given doesn't apply to this basket

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
 * Gwinn's platform fee on ONLINE + AGENT-originated orders. Computed on the
 * product subtotal only — never on shipping — and in-person POS sales never
 * carry a fee at all (server/pos.ts). An unknown plan value bills like Free,
 * matching the DB default.
 *
 * Takes the tenant's billing facts rather than a bare plan id so a comped store
 * cannot be skimmed by a caller that only had `tenant.plan` to hand — the fee
 * has two ways to reach zero (Pro, and an explicit waiver) and
 * shared/entitlements.ts owns both.
 */
export function platformFeeRappen(
  tenant: TenantBillingFacts,
  subtotalRappen: number,
): number {
  return Math.round((subtotalRappen * onlineFeeBpsFor(tenant)) / 10_000);
}

/**
 * Does this Stripe error mean "your platform fee is not acceptable", as
 * opposed to something genuinely wrong with the order?
 *
 * Deliberately narrow. A false positive here would retry a real failure with
 * the fee stripped and hand the vendor a charge we can't earn on; a false
 * negative just means we surface the error, which is the safe direction. So
 * we match only on Stripe telling us the fee parameter is the problem, or on
 * a permissions error — the shape a Connect relationship that can't take fees
 * actually produces. Amount/currency/card errors are left to propagate.
 */
export function isPlatformFeeRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
  };

  // Stripe points at the offending parameter when it can.
  if (e.param && /application_fee/i.test(e.param)) return true;

  // The platform isn't permitted to collect fees on this account.
  if (e.type === "StripePermissionError") return true;
  if (
    e.code &&
    /application_fees?_not_allowed|platform_account_required/i.test(e.code)
  ) {
    return true;
  }

  // Last resort: an invalid-request error that names application fees. Scoped
  // to invalid_request so a card decline mentioning "fee" can't match.
  return (
    e.type === "StripeInvalidRequestError" &&
    typeof e.message === "string" &&
    /application fee/i.test(e.message)
  );
}

export interface CreateCheckoutResult {
  url: string;
  sessionId: string;
  amountTotal: number;
  currency: string;
  /** What Gwinn took from this order, in Rappen (0 on Pro). */
  platformFeeRappen: number;
  items: { id: number; name: string; price: string }[];
  /** The code that was applied and what it took off, or null. */
  discount: { code: string; amountOffRappen: number } | null;
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
  /**
   * Storefront language the customer is browsing in (de/en/fr/it). Renders
   * the Stripe Checkout page in that language and is stored on the order so
   * the receipt email matches; omitted → Stripe auto-detects, receipt
   * defaults to English.
   */
  locale?: "de" | "en" | "fr" | "it";
  /**
   * A discount code the shopper typed, exactly as they typed it. Normalised and
   * validated here — the storefront's live preview (`discounts.check`) is
   * advisory, and nothing it returns is trusted at this point.
   */
  discountCode?: string;
}): Promise<CreateCheckoutResult> {
  const { tenant, channel, baseUrl } = params;

  const stripe = getStripe();
  if (!stripe) {
    throw new CheckoutError(
      "NOT_CONFIGURED",
      "Online payment is not configured. Please enquire via WhatsApp.",
    );
  }

  // We never process a tenant's customer payments through Gwinn's own
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
  // Free shipping is earned on what the shopper put in the basket, before any
  // code is applied. A CHF 55 basket with a 20% code still ships free: the
  // alternative quietly adds CHF 8 back at the last screen, which reads as the
  // discount not working.
  const chShippingFeeRappen =
    subtotalRappen >= FREE_SHIPPING_THRESHOLD_RAPPEN
      ? 0
      : CH_FLAT_SHIPPING_FEE_RAPPEN;

  // ── Discount code ───────────────────────────────────────────────────────────
  // Claimed here, BEFORE the Stripe call, because the claim is what enforces a
  // redemption limit under concurrency (server/discounts.ts). From this point
  // on every failure path has to give the slot back, which is what the
  // try/catch below is for.
  let claimedDiscount: ClaimedDiscount | null = null;
  if (params.discountCode?.trim()) {
    const claim = await claimDiscount({
      tenantId,
      rawCode: params.discountCode,
      subtotalRappen,
      currency,
    });
    if (!claim.ok) {
      // The basket is already reserved by this point; a refused code must not
      // leave those pieces held for the next half hour.
      await releaseProductReservations(tenantId, uniqueIds).catch(() => {});
      throw new CheckoutError("DISCOUNT_REFUSED", claim.message);
    }
    claimedDiscount = claim.discount;
  }

  const discountedSubtotalRappen =
    subtotalRappen - (claimedDiscount?.amountOffRappen ?? 0);

  // Set once the claim has been written against a session. The failure path
  // needs to know which of the two states it is undoing: a bare claim (decrement
  // the counter) or a recorded hold (mark the row released AND decrement).
  // Undoing the wrong one decrements twice, and two sweeps of that hand a
  // merchant's limited promotion extra redemptions it never authorised.
  let heldSessionId: string | null = null;

  // The platform fee follows the money the merchant actually receives. Charging
  // 1% of a price nobody paid would make running a promotion cost the merchant
  // more per franc earned than not running one.
  const feeRappen = platformFeeRappen(tenant, discountedSubtotalRappen);

  // The second argument's `stripeAccount` runs this call on the tenant's own
  // connected Standard account (a "direct charge") using Gwinn's platform key
  // — funds settle straight to the tenant, no raw tenant Stripe key ever
  // touches Gwinn's servers. application_fee_amount is the platform's cut of
  // that direct charge; omitted entirely when the fee is 0 (Pro plan).
  const buildParams = (fee: number, couponId: string | null) => ({
    mode: "payment" as const,
    // Credit & debit cards plus TWINT (Swiss mobile payment)
    payment_method_types: ["card", "twint"] as ("card" | "twint")[],
    line_items: lineItems,
    // Without this, one-time "payment" mode sessions never create a Stripe
    // Customer, so the dashboard's Customers count stays at 0.
    customer_creation: "always" as const,
    billing_address_collection: "required" as const,
    shipping_address_collection: {
      allowed_countries: [...SHIPPING_COUNTRIES],
    },
    // Stripe Checkout shows every option to every customer regardless of the
    // address they enter — it doesn't filter shipping_options by destination
    // country within a single session config. The customer picks the option
    // matching their own country from the two labeled choices below; this is
    // the standard workaround for per-country flat rates without a custom
    // shipping-rate lookup.
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount" as const,
          fixed_amount: { amount: chShippingFeeRappen, currency },
          display_name:
            chShippingFeeRappen === 0
              ? "Free shipping (Switzerland)"
              : "Standard shipping (Switzerland)",
          delivery_estimate: {
            minimum: { unit: "business_day" as const, value: 2 },
            maximum: { unit: "business_day" as const, value: 3 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount" as const,
          fixed_amount: { amount: EU_FLAT_SHIPPING_FEE_RAPPEN, currency },
          display_name: "Standard shipping (EU)",
          delivery_estimate: {
            minimum: { unit: "business_day" as const, value: 4 },
            maximum: { unit: "business_day" as const, value: 7 },
          },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    // The discount, as a one-off coupon on the tenant's OWN connected account
    // (created below). Stripe applies it to the line-item subtotal, never to
    // the shipping rate — which is the behaviour the free-shipping threshold
    // above already assumes. Omitted entirely when there is no code, so a
    // storefront that never runs a promotion sends exactly the parameters it
    // always did.
    ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
    locale: params.locale ?? ("auto" as const),
    // Controls the merchant name shown on TWINT and bank statements. 22-char
    // max. The Stripe account business profile name (on the tenant's OWN
    // connected account) also affects TWINT display.
    // NOTE: must be inside payment_intent_data for Checkout Sessions;
    // top-level statement_descriptor is rejected by newer Stripe APIs.
    payment_intent_data: {
      statement_descriptor: (tenant.name || "GWINN STORE")
        .slice(0, 22)
        .toUpperCase(),
      ...(fee > 0 ? { application_fee_amount: fee } : {}),
    },
    success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/checkout/cancel`,
    metadata: {
      productIds: uniqueIds.join(","),
      channel,
      // Recorded on the session so a support question ("why was this order
      // CHF 12 less?") is answerable from Stripe alone.
      ...(claimedDiscount ? { discountCode: claimedDiscount.code } : {}),
    },
    // Matches the reservation TTL above (30 min, Stripe's own minimum for
    // expires_at) so the hold on these pieces never outlives the session that
    // placed it.
    expires_at: Math.floor((Date.now() + PRODUCT_RESERVATION_TTL_MS) / 1000),
  });

  // Wrapped so a Stripe/DB failure after the reservation above doesn't leave a
  // phantom hold on these pieces — or on a redemption slot — until it times out
  // on its own.
  try {
    // A discount reaches Stripe as a one-off coupon on the tenant's own
    // connected account: an amount, not a percentage, so the figure Stripe
    // charges is byte-for-byte the one shared/discounts.ts computed and the one
    // the basket showed. `duration: "once"` and `max_redemptions: 1` bound the
    // coupon to this single session — the code's own limit is ours to enforce,
    // and a coupon left reusable on the merchant's account would be a second,
    // unmanaged one.
    let couponId: string | null = null;
    if (claimedDiscount) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: claimedDiscount.amountOffRappen,
          currency,
          duration: "once",
          name: claimedDiscount.code.slice(0, 40),
          max_redemptions: 1,
          metadata: { platformDiscountCode: claimedDiscount.code },
        },
        { stripeAccount: connectedAccountId },
      );
      couponId = coupon.id;
    }

    let chargedFeeRappen = feeRappen;
    let session;
    try {
      session = await stripe.checkout.sessions.create(
        buildParams(feeRappen, couponId),
        { stripeAccount: connectedAccountId },
      );
    } catch (err) {
      // A rejected application fee fails the ENTIRE session creation, not just
      // the fee — so without this, a Connect misconfiguration would take a
      // vendor's whole online storefront down rather than cost us 1%. Retry
      // once without the fee: an un-monetized sale is strictly better than a
      // lost one, and the loud log plus the 0 recorded on an otherwise
      // fee-bearing order is how we find out it happened.
      if (feeRappen > 0 && isPlatformFeeRejection(err)) {
        console.error(
          `[Checkout] Stripe rejected the platform fee for tenant ${tenantId} ` +
            `(connected account ${connectedAccountId}). Retrying WITHOUT the fee ` +
            `so the sale still completes — this order earns ${BRAND.name} nothing. ` +
            `Check the Connect relationship. Original error:`,
          err,
        );
        session = await stripe.checkout.sessions.create(
          buildParams(0, couponId),
          { stripeAccount: connectedAccountId },
        );
        chargedFeeRappen = 0;
      } else {
        throw err;
      }
    }

    const amountTotal = session.amount_total ?? discountedSubtotalRappen;

    // The claim taken above is now tied to a session, with the same expiry, so
    // an abandoned checkout gives the slot back instead of burning a code.
    if (claimedDiscount) {
      await recordDiscountHold({
        tenantId,
        discount: claimedDiscount,
        stripeSessionId: session.id,
        currency,
      });
      heldSessionId = session.id;
    }

    await createOrder({
      tenantId,
      stripeSessionId: session.id,
      status: "pending",
      amountTotal,
      currency,
      productIds: uniqueIds.join(","),
      channel,
      platformFeeRappen: chargedFeeRappen,
      locale: params.locale ?? null,
    });

    return {
      url: session.url as string,
      sessionId: session.id,
      amountTotal,
      currency,
      platformFeeRappen: chargedFeeRappen,
      items: items.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      discount: claimedDiscount
        ? {
            code: claimedDiscount.code,
            amountOffRappen: claimedDiscount.amountOffRappen,
          }
        : null,
    };
  } catch (err) {
    await releaseProductReservations(tenantId, uniqueIds).catch(() => {});
    // The claim was taken before Stripe was called, so anything that failed
    // after it — the coupon, the session, the order row — has to give the slot
    // back. Without this a customer who hit a Stripe outage would find their
    // single-use code already spent when they tried again.
    if (claimedDiscount) {
      await releaseDiscountClaim({
        tenantId,
        codeId: claimedDiscount.codeId,
        ...(heldSessionId ? { stripeSessionId: heldSessionId } : {}),
      });
    }
    throw err;
  }
}
