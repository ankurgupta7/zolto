/**
 * The page-view snippet — the human half of "who came to the site", opposite
 * server/agentHits.ts's machine half.
 *
 * ## Why this is server-side and not a line in index.html
 *
 * It WAS a line in index.html, and it never worked. The shell carried
 *
 *     <script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%">
 *
 * and neither variable was defined anywhere — not in .env.example, not in
 * docker-compose.yml, not in deploy/lib/build.sh. Vite leaves an undefined
 * `%VAR%` placeholder verbatim, so production shipped a script tag pointing at
 * the literal string `%VITE_ANALYTICS_ENDPOINT%/umami`, which fell through to
 * the SPA catch-all, came back as text/html, and was refused by the browser.
 * Every page load, zero data — while the privacy policy told visitors in four
 * languages that we measure page views with Umami.
 *
 * Two things make the server the right home for it:
 *
 *   1. **It can be absent.** A `VITE_` value is baked into the bundle at build
 *      time, so "not configured" still ships a tag. Here, an unconfigured
 *      install emits nothing at all — which is what a self-hoster who wants no
 *      analytics should get (SELF_HOSTING.md), and what every test and
 *      screenshot run gets for free.
 *   2. **One shell serves every surface.** index.html is shared by the
 *      marketing site and every tenant storefront, so a build-time constant can
 *      only ever produce one bucket. Injected per request, zolto.ch and the
 *      storefronts are separable.
 *
 * ## What separates one store from another
 *
 * Umami records the hostname on every event, so all storefronts share one
 * website id and are told apart by host in the dashboard. Deliberate, and worth
 * being plain about: it means a merchant cannot be handed a login to just their
 * own numbers. Giving each store its own id would need a per-tenant setting and
 * an admin field; the hostname breakdown answers the same question today
 * without a migration.
 */

import { escapeHtml } from "./headInject";

/** Which surface a page belongs to. Two ids, so the two never sum together. */
export type AnalyticsSurface = "marketing" | "storefront";

export interface AnalyticsConfig {
  /**
   * Where the Umami script and its collect API live. A same-origin path
   * (`/_stats`) rather than a foreign origin is the intended shape: the whole
   * stack is built so that no visitor IP reaches a third party, and a
   * first-party path is also the one ad blockers do not strip.
   */
  endpoint: string;
  /** Website id for the marketing surface (zolto.ch). */
  marketingWebsiteId: string;
  /** Website id shared by every tenant storefront. */
  storefrontWebsiteId: string;
}

/**
 * A website id is a UUID in Umami. Validating it is not about trusting the
 * operator — it is about failing visibly at the source rather than emitting a
 * tag that silently collects nothing, which is the exact failure this module
 * exists to clean up.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An endpoint is either a same-origin path (`/_stats`) or an absolute https
 * origin. Anything else — a protocol-relative URL, a javascript: scheme — is
 * refused rather than interpolated into a src attribute.
 */
function validEndpoint(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, "");
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(value)) return value;
  return null;
}

/**
 * Read the configuration from the environment. Returns null when analytics is
 * not configured, which is the default and is not an error: a self-hosted
 * install that wants no measurement simply leaves these unset and no script
 * tag is ever emitted.
 *
 * Read at call time rather than at module load so a test can set the
 * environment without re-importing, matching how the rest of the server
 * treats optional integrations.
 */
export function analyticsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AnalyticsConfig | null {
  const endpoint = validEndpoint(env.ANALYTICS_ENDPOINT ?? "");
  if (!endpoint) return null;

  const marketingWebsiteId = (env.ANALYTICS_WEBSITE_ID ?? "").trim();
  if (!UUID.test(marketingWebsiteId)) return null;

  // Falling back to the marketing id rather than dropping storefront
  // measurement entirely: a single-store self-hoster has one site and should
  // not have to create two.
  const storefrontRaw = (env.ANALYTICS_STOREFRONT_WEBSITE_ID ?? "").trim();
  const storefrontWebsiteId = UUID.test(storefrontRaw)
    ? storefrontRaw
    : marketingWebsiteId;

  return { endpoint, marketingWebsiteId, storefrontWebsiteId };
}

/**
 * The `<script>` tag for a surface, or "" when analytics is not configured.
 *
 * `data-do-not-track` makes the script honour the browser's DNT header, and
 * Umami is cookieless and sets no cross-site identifier — which is what the
 * privacy policy (client/src/marketing/locales/*.json) already promises, and
 * what keeps this from needing a consent banner.
 */
export function analyticsSnippet(
  surface: AnalyticsSurface,
  config: AnalyticsConfig | null = analyticsConfigFromEnv(),
): string {
  if (!config) return "";
  const websiteId =
    surface === "marketing"
      ? config.marketingWebsiteId
      : config.storefrontWebsiteId;
  const src = escapeHtml(`${config.endpoint}/script.js`);
  return (
    `<script defer src="${src}" data-website-id="${escapeHtml(websiteId)}"` +
    ` data-do-not-track="true"></script>`
  );
}
