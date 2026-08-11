/**
 * "Made with Zolto" — the platform credit a merchant storefront carries.
 *
 * Every store Zolto serves should say, in a way a shopper, a search crawler and
 * an AI agent can each pick up, that it runs on Zolto and where Zolto lives.
 * That is one string in four places, and they must not drift:
 *
 *   1. the storefront footer            (a human reads it, a crawler follows it)
 *   2. `<meta name="generator">` + the WebSite JSON-LD `creator` node
 *      (server/storefrontHead.ts, server/storefrontSeo.ts — the AI crawlers that
 *      never run our JavaScript see only the injected HTML)
 *   3. `/llms.txt`                      (server/llms.ts)
 *   4. the MCP `get_store_info` tool    (server/mcp.ts — the agent-facing API)
 *
 * ## The plan gate, and why it is now an opt-out
 *
 * Pro's pricing card sold `Your brand only — no "runs on Zolto"`, and
 * `PLAN_FEATURES.pro.whiteLabel` made that automatic: every Pro store dropped
 * the credit silently. But a custom domain is *also* Pro-only
 * (`PLAN_FEATURES.free.customDomain === false`), so the exact stores where the
 * Zolto name is least discoverable — someone else's domain, our HTML — were the
 * only ones that never carried it.
 *
 * So the credit now shows by default on every plan, and `whiteLabel` buys the
 * *right to turn it off* (`tenant_settings.hide_zolto_badge`) rather than
 * turning it off unasked. A Free store cannot hide it; a Pro store hides it with
 * one switch on the Storefront settings page. The pricing copy was updated to
 * describe that — see PLANS in shared/platform.ts.
 *
 * Pure data and pure functions: the client, the server and the tests all read
 * this file, and none of them needs a database or a browser to do it.
 */

import { featuresForTenant, type TenantBillingFacts } from "./entitlements";

/**
 * The one address Zolto answers on. Deliberately hard-coded rather than derived
 * from the request: a storefront on `shop.example.com` has no idea what the
 * platform's own origin is, and that store is precisely the one whose credit has
 * to name it. shared/platformDomains.test.ts is the guard that this stays the
 * only domain the platform ever publishes.
 */
export const ZOLTO_URL = "https://zolto.ch";

export const ZOLTO_ATTRIBUTION = {
  /** Platform name, as it appears in the credit. */
  name: "Zolto",
  url: ZOLTO_URL,
  /** What a visitor who clicks through is going to find. */
  tagline: "the point of sale and online shop for makers",
  /** `<meta name="generator">` value — the convention every site builder uses. */
  generator: `Zolto (${ZOLTO_URL})`,
} as const;

/**
 * The billing facts plus the merchant's own preference. Structural rather than a
 * `Tenant` + `TenantSettings` pair so the client can build it from a tRPC
 * response and the server from Drizzle rows.
 */
export interface AttributionFacts extends TenantBillingFacts {
  /** `tenant_settings.hide_zolto_badge` — only honoured on a white-label plan. */
  hideZoltoBadge?: boolean | null;
}

/**
 * May this store hide the credit at all? True on plans that include
 * white-labelling; the switch is inert (and the admin UI shows an upsell)
 * everywhere else, which is what stops a Free store from opting out of the
 * thing it is paying with.
 */
export function mayHideZoltoAttribution(tenant: TenantBillingFacts): boolean {
  return featuresForTenant(tenant).whiteLabel;
}

/**
 * Does this storefront carry the credit? The single gate — read it from here in
 * the footer, the head injector, llms.txt and MCP alike rather than
 * re-deriving `plan === "pro"`, which is the mistake shared/entitlements.ts
 * exists to prevent (a comped Pro store must be honoured too).
 */
export function showsZoltoAttribution(tenant: AttributionFacts): boolean {
  return creditShown(mayHideZoltoAttribution(tenant), tenant.hideZoltoBadge);
}

/**
 * The same rule for a caller that already has the two flags separately — the
 * storefront client, which learns "may this store white-label?" from
 * `tenant.getBySlug` and the switch itself from `tenant.getSettings`, and has
 * no plan/comp columns to run {@link showsZoltoAttribution} against.
 */
export function creditShown(
  mayHide: boolean,
  hideZoltoBadge?: boolean | null,
): boolean {
  return !mayHide || !hideZoltoBadge;
}

/**
 * Where the credit points. UTM tags on the *visible* link only, so the platform
 * can tell a storefront referral from direct traffic; the JSON-LD `@id`, the
 * llms.txt link and the MCP payload all use the bare {@link ZOLTO_URL} so an
 * agent resolving the entity gets one canonical address.
 */
export function zoltoAttributionHref(source = "storefront"): string {
  const params = new URLSearchParams({
    utm_source: source,
    utm_medium: "made-with-zolto",
  });
  return `${ZOLTO_URL}/?${params.toString()}`;
}

/**
 * The Organization node for a storefront's JSON-LD graph, pointed at by
 * `WebSite.creator`. Its `@id` is the absolute `https://zolto.ch/#organization`
 * — the same id server/marketingSeo.ts mints for the marketing site — so a
 * consumer crawling both surfaces resolves one Zolto, not two.
 */
export function zoltoCreatorJsonLd(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${ZOLTO_URL}/#organization`,
    name: ZOLTO_ATTRIBUTION.name,
    url: `${ZOLTO_URL}/`,
    description: `Zolto — ${ZOLTO_ATTRIBUTION.tagline}.`,
  };
}

/** The `creator` reference a storefront's WebSite node carries. */
export function zoltoCreatorRef(): Record<string, unknown> {
  return { "@id": `${ZOLTO_URL}/#organization` };
}

/**
 * One plain sentence, for the surfaces that have no markup: the `<noscript>`
 * body, `/llms.txt`, and anywhere else a human or a model reads prose. Names the
 * store so the sentence stands on its own when an agent quotes it out of
 * context.
 */
export function zoltoCreditSentence(storeName: string): string {
  return `${storeName} is made with Zolto (${ZOLTO_URL}) — ${ZOLTO_ATTRIBUTION.tagline}.`;
}

/** What the MCP `get_store_info` tool reports about the platform underneath. */
export function zoltoPoweredBy(): {
  name: string;
  url: string;
  description: string;
} {
  return {
    name: ZOLTO_ATTRIBUTION.name,
    url: ZOLTO_URL,
    description: `This store is built and hosted on Zolto — ${ZOLTO_ATTRIBUTION.tagline}. Makers can open their own store at ${ZOLTO_URL}.`,
  };
}
