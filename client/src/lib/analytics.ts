/**
 * "What did people do while they were here?" — the handful of storefront
 * moments worth counting, beyond the page views Umami records on its own.
 *
 * ## The rule these events are chosen by
 *
 * Aggregate only. Every payload here is a category, a currency or a count —
 * never a name, an email, an order id or a product id. The privacy policy tells
 * visitors, in four languages, that measurement gives us "aggregate statistics,
 * not profiles of individual visitors" (client/src/marketing/locales/*.json),
 * and an event carrying an order id would quietly make that untrue: joined
 * against the orders table it identifies one buyer.
 *
 * That constraint is why `checkout_completed` reports a rounded band rather
 * than the basket total, and why nothing here reports which item was bought.
 * The exact figures already exist, correctly attributed and access-controlled,
 * in the merchant's own admin (server/insights.ts). This is for shape —
 * "how many people reach the bag and never pay" — not for accounting.
 *
 * ## Why it degrades to nothing
 *
 * `window.umami` exists only when server/analytics.ts injected the tag, which
 * it does only when the operator configured an endpoint and a website id. Every
 * call here is a no-op otherwise: unconfigured installs, the test suite, the
 * screenshot harness and any visitor whose blocker ate the script all take the
 * silent path. Tracking must never be able to break a checkout.
 */

/** The events this app emits. A closed list so the dashboard's rows are known. */
export type AnalyticsEvent =
  | "product_viewed"
  | "cart_add"
  | "checkout_started"
  | "checkout_completed";

/**
 * Umami's tracker, as it appears on `window` once the script has loaded.
 * Declared structurally rather than imported — the script is injected by the
 * server and is not a build-time dependency.
 */
interface UmamiTracker {
  track: (event: string, data?: Record<string, unknown>) => void;
}

function tracker(): UmamiTracker | null {
  if (typeof window === "undefined") return null;
  const umami = (window as { umami?: unknown }).umami;
  if (!umami || typeof (umami as UmamiTracker).track !== "function")
    return null;
  return umami as UmamiTracker;
}

/**
 * Record one event. Never throws: a tracker that is absent, half-loaded or
 * itself broken must not be able to take a storefront down with it.
 */
export function track(
  event: AnalyticsEvent,
  data?: Record<string, string | number>,
): void {
  try {
    tracker()?.track(event, data);
  } catch {
    /* measurement is never worth an error a shopper can see */
  }
}

/**
 * Round a money amount to a coarse band before it is ever sent.
 *
 * An exact total is close to an identifier — a single order of CHF 247.50 on a
 * small store's dashboard is one person, and the policy promises aggregates.
 * Bands keep "are agent baskets bigger than web baskets?" answerable while
 * keeping any single row unattributable.
 */
export function priceBand(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "unknown";
  const bands = [20, 50, 100, 200, 500, 1000];
  for (const top of bands) {
    if (amount < top) return `<${top}`;
  }
  return `${bands[bands.length - 1]}+`;
}

/** A shopper opened a product page. Category only — never which item. */
export function trackProductViewed(category: string): void {
  track("product_viewed", { category });
}

/** A shopper put something in the bag. */
export function trackCartAdd(category: string, cartSize: number): void {
  track("cart_add", { category, cart_size: cartSize });
}

/**
 * A shopper pressed Pay. Paired with `checkout_completed` this is the only
 * measurement of the gap between intent and payment, which is the number a
 * merchant can actually act on.
 */
export function trackCheckoutStarted(items: number, total: number): void {
  track("checkout_started", { items, band: priceBand(total) });
}

/** Stripe sent the shopper back and the order is paid. */
export function trackCheckoutCompleted(total: number, currency: string): void {
  track("checkout_completed", {
    band: priceBand(total),
    currency: currency.toUpperCase(),
  });
}
