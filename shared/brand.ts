/**
 * The brand — the one place the platform's name is spelled.
 *
 * ## Why this file exists
 *
 * This codebase has been renamed twice (Kalakosh → Zolto → Gwinn), and the first
 * rename was done with find-and-replace. Its leftovers were still in the tree
 * years later: a `KalakoshApplication.kt` that declared `class ZoltoApplication`,
 * a `kalakosh_lang` localStorage key read by the current i18n bootstrap, and a
 * handful of `kalakosh-logo*.png` nobody could account for. A sed sweep leaves
 * exactly that kind of residue, because it can only find the spellings you
 * thought to grep for.
 *
 * So the rule here is: **the brand name appears once, in this file.** Everything
 * downstream — hostnames, reverse-DNS ids, storage keys, URL routes, wire
 * strings, artifact filenames — is *derived*, not re-typed. A future rename is
 * an edit to {@link NAME} and {@link SLUG} plus whatever `shared/brand.check.test.ts`
 * then reports as out of step.
 *
 * ## The three surfaces, and why one mechanism isn't enough
 *
 *   1. **TS/TSX** (client, server, shared, scripts) imports `BRAND` directly.
 *      This is the large majority and it is fully covered.
 *   2. **Translated copy** cannot import TS — locale JSON is data. Those strings
 *      carry `{{brand}}` and i18next substitutes {@link NAME} through
 *      `interpolation.defaultVariables` (see client/src/lib/i18n.ts). This also
 *      keeps German inflection honest: `{{brand}}s` is a correct genitive for
 *      whatever name is chosen next, where a hard-coded "Zoltos" was not.
 *   3. **Foreign build systems** — Gradle, xcodegen's `project.yml`,
 *      `AndroidManifest.xml`, `strings.xml`, `Caddyfile`, `docker-compose.yml`,
 *      `Dockerfile`, `.env.example`, `package.json`, `client/index.html` — can
 *      neither import TS nor be safely rewritten by a codegen step we'd have to
 *      trust. They spell the name literally, and `shared/brand.check.test.ts`
 *      asserts every one of those literals against this file. The next rename
 *      does not have to *find* them; the failing test names them.
 *
 * Pure data and pure derivations: no imports, no environment, no I/O. The
 * client, the server, the deploy scripts and the tests all read it.
 */

/** The name as a human reads it. The one string a rename actually changes. */
const NAME = "Gwinn";

/**
 * The lowercase machine form. Derived rather than written twice — a rename that
 * updated one and not the other is precisely the failure this file prevents.
 * Everything that ends up in a hostname, an identifier or a storage key is built
 * from this.
 */
const SLUG = NAME.toLowerCase();

/**
 * The public suffix. `.ch` is load-bearing rather than cosmetic: the Swissness
 * claim on the marketing surface (shared/platform.ts SWISS_MADE) and the data
 * residency argument both lean on the platform being a Swiss address, and
 * merchants' own storefronts are subdomains of it.
 */
const TLD = "ch";

/** The apex the platform answers on. Tenant storefronts are `<slug>.<domain>`. */
const DOMAIN = `${SLUG}.${TLD}`;

/**
 * Reverse-DNS prefix for every platform-issued identifier: app ids, bundle ids,
 * the Apple Services ID, the Docker image label, the iOS keychain service.
 * `ch.` rather than `com.` for the same reason the domain is `.ch`.
 */
const REVERSE_DNS = `${TLD}.${SLUG}`;

/**
 * The register app's product name, in the PascalCase form build systems want —
 * an Xcode scheme, a Gradle `rootProject.name`, a release artifact filename.
 * Distinct from {@link BRAND.posDisplayName}, which is what a person sees on a
 * home screen.
 */
const POS_PRODUCT = `${NAME}POS`;

export const BRAND = {
  // ── Identity ──────────────────────────────────────────────────────────────
  name: NAME,
  slug: SLUG,

  /**
   * What a visitor who clicks the storefront credit is going to find. Part of
   * the credit itself, so it travels with the name rather than being restated
   * in shared/attribution.ts.
   */
  tagline: "the point of sale and online shop for makers",

  // ── Web ───────────────────────────────────────────────────────────────────
  domain: DOMAIN,
  wwwHost: `www.${DOMAIN}`,
  url: `https://${DOMAIN}`,

  /**
   * The hosts that render the marketing surface rather than a storefront. Any
   * other host — a subdomain or a merchant's own domain — is a shop.
   * shared/marketing.ts and client/src/lib/surface.ts both read this; they used
   * to keep two hand-synced copies with a comment asking future editors to
   * remember, which is not a mechanism.
   */
  marketingHosts: [DOMAIN, `www.${DOMAIN}`] as readonly string[],

  /**
   * The `<meta>` name that carries a storefront's tenant slug from the server's
   * injected HTML to the client bundle (server/storefrontHead.ts →
   * client/src/lib/surface.ts). A wire contract: both ends must agree, and a
   * cached page served to a new bundle is exactly when they wouldn't.
   */
  tenantSlugMeta: `${SLUG}-tenant-slug`,

  // ── Marketing routes ──────────────────────────────────────────────────────
  /** `/why-gwinn` — the AI-native argument in full. */
  whyPath: `/why-${SLUG}`,
  /** `/compare/gwinn-vs-<competitor>`. */
  comparePathPrefix: `/compare/${SLUG}-vs-`,

  // ── Browser storage ───────────────────────────────────────────────────────
  /**
   * Keys are namespaced by slug so a rename cannot silently collide with a
   * previous brand's values in a returning visitor's browser. Pre-launch there
   * is nothing to migrate; the namespacing is for the rename after this one.
   */
  themeKey: `${SLUG}_theme`,
  langKey: `${SLUG}_lang`,
  discountCodeKey: `${SLUG}_discount_code`,
  claimTokenKey: `${SLUG}_claim_token`,
  /** Prefix; a tour appends its own id, e.g. `gwinn.tour.admin-v1`. */
  tourKeyPrefix: `${SLUG}.tour.`,

  // ── Mobile (the register app) ─────────────────────────────────────────────
  reverseDns: REVERSE_DNS,
  posProduct: POS_PRODUCT,
  /** What the app is called on a home screen and in the stores. */
  posDisplayName: `${NAME} POS`,
  androidApplicationId: `${REVERSE_DNS}.pos`,
  iosBundleId: `${REVERSE_DNS}.pos`,
  iosTestBundleId: `${REVERSE_DNS}.pos.tests`,
  /** iOS Keychain service holding the paired store's POS API key. */
  iosKeychainService: `${REVERSE_DNS}.pos.credentials`,
  /** `CFBundleURLName` for the pairing scheme's URL type. */
  iosPairingUrlName: `${REVERSE_DNS}.pos.pairing`,
  /**
   * Sign in with Apple **Services ID** — the web client id, not the app's bundle
   * id. Apple scopes a user's opaque `sub` to it, so changing it makes every
   * existing Apple sign-in look like a new person. Safe to change only while
   * nobody has signed in yet.
   */
  appleServicesId: `${REVERSE_DNS}.web`,

  /**
   * Custom URL scheme for one-tap register pairing: `gwinn://pair?t=…&url=…`.
   * A custom scheme rather than a Universal Link because an
   * apple-app-site-association needs a stable team id, which an unsigned
   * sideloaded build does not have.
   */
  urlScheme: SLUG,

  /** Release artifacts, fetched at runtime by server/posDownloads.ts. */
  androidApkAsset: `${POS_PRODUCT}-latest.apk`,
  iosIpaAsset: `${POS_PRODUCT}-latest-unsigned.ipa`,

  // ── Infrastructure ────────────────────────────────────────────────────────
  dbName: SLUG,
  dbUser: `${SLUG}_user`,
  dockerNetwork: `${SLUG}_internal`,
  dockerAppAlias: `${SLUG}-app`,
  /** Image label written by the Dockerfile, read back by deploy/lib/build.sh. */
  dockerFingerprintLabel: `${REVERSE_DNS}.source-fingerprint`,
  s3ImagesBucket: `${SLUG}-images`,
  s3BackupsBucket: `${SLUG}-backups`,

  /**
   * Where the POS release artifacts live. Renaming the repository is a GitHub
   * action, not a code change, so this stays pointed at the real slug until that
   * happens; `POS_RELEASE_REPO` overrides it in the meantime.
   */
  githubRepo: "ankurgupta7/zolto",

  // ── Third-party wire strings ──────────────────────────────────────────────
  /**
   * Stripe subscription metadata key. Used to *find* existing platform
   * subscriptions, so changing it on a live account orphans them — see
   * server/billing.ts.
   */
  stripeBillingMetaKind: `${SLUG}Billing`,
  /**
   * Fallback card-statement descriptor when a tenant has no usable name. Stripe
   * caps this at 22 characters and accepts no `<>"'` — keep it short and plain.
   */
  stripeStatementFallback: `${NAME.toUpperCase()} STORE`,
  /** MCP `serverInfo.name`; agent clients may key their config on it. */
  mcpServerName: `${SLUG}-storefront`,
  /** UTM tag on the visible "Made with …" credit. */
  attributionUtmMedium: `made-with-${SLUG}`,
  /**
   * Column the Google Sheets mirror writes into a merchant's spreadsheet and
   * matches on when that sheet is re-imported (server/sheetMirror.ts).
   */
  sheetIdColumn: `${SLUG}_id`,
  /** User-Agent the POS download proxy identifies itself with. */
  downloadsUserAgent: `${SLUG}-pos-downloads`,
} as const;

/**
 * The `<meta name="generator">` value — the convention every site builder uses,
 * and one of the four places the platform credit has to appear identically.
 */
export const BRAND_GENERATOR = `${BRAND.name} (${BRAND.url})`;

/** A tenant storefront's default address: `bergblume.gwinn.ch`. */
export function storefrontHost(tenantSlug: string): string {
  return `${tenantSlug}.${BRAND.domain}`;
}

/** A one-tap register pairing deep link. */
export function pairingLink(token: string, storeUrl?: string): string {
  const params = new URLSearchParams({ t: token });
  if (storeUrl) params.set("url", storeUrl);
  return `${BRAND.urlScheme}://pair?${params.toString()}`;
}

/**
 * Strip the brand out of a string that is used as an i18n *key*.
 *
 * A few locale groups are keyed by their English prose — `faqs["What is
 * Gwinn?"]`, `faqCategories["About Gwinn"]` — which means the key moved every
 * time the product was renamed, and i18next answers a missing key by silently
 * falling back to the English default. Nothing fails; the page just quietly
 * stops being translated.
 *
 * So the key is normalised on both sides: the locale files store
 * `"What is {{brand}}?"` and every lookup runs the runtime question through
 * here first. The keys are now stable across any future rename.
 */
export function brandNeutralKey(text: string): string {
  return text.split(BRAND.name).join("{{brand}}");
}

/**
 * The inverse of {@link brandNeutralKey}: fill `{{brand}}` in, the way i18next
 * does at render. For tests and for any non-React caller that reads a locale
 * value directly and needs the string a user would actually see.
 */
export function withBrand<T>(node: T): T {
  if (typeof node === "string")
    return node.split("{{brand}}").join(BRAND.name) as T;
  if (Array.isArray(node)) return node.map(withBrand) as T;
  if (node !== null && typeof node === "object")
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, v]) => [
        k,
        withBrand(v),
      ]),
    ) as T;
  return node;
}

export default BRAND;
