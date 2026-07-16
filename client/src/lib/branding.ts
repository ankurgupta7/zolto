/**
 * Storefront branding — the tenant-themeable chrome/commerce layer.
 *
 * A tenant's storefront gets its name, contact channels, logo, and brand color
 * from `tenant_settings`. Fallbacks are per-tenant:
 *   - Kalakosh (tenant #1) falls back to its own known values, so it stays
 *     pixel-identical even before settings are seeded.
 *   - Every other tenant falls back to NEUTRAL defaults — crucially, contact
 *     channels default to null (the chrome hides them) so no tenant ever inherits
 *     Kalakosh's phone number, Instagram, email, or logo.
 *
 * NOTE: this covers chrome + commerce data only (name, contacts, colors, logo).
 * Deep tenant *content* — FAQ prose, the About story, Swiss AGB legal text — is
 * the tenant's own content and is not parameterized here; it only ever renders on
 * that tenant's storefront surface.
 */

export interface Branding {
  /** Full display name, e.g. "Kalakosh Zürich". */
  storeName: string;
  /** Short name for tight spaces, e.g. "Kalakosh". */
  shortName: string;
  /** E.164 digits without "+", for wa.me links, e.g. "41791721714". */
  whatsappNumber: string | null;
  /** Instagram handle without "@", e.g. "kalakoshzurich". */
  instagramHandle: string | null;
  contactEmail: string | null;
  /** Logo for light backgrounds (navbar). Null → render the store name as text. */
  logoUrl: string | null;
  /** Logo for dark backgrounds (footer). Falls back to logoUrl. */
  logoUrlDark: string | null;
  /** ISO currency code, lowercase, e.g. "chf". */
  currency: string;
  /** Dominant dark brand color (drives --brand-ink), e.g. "#2D2620". */
  primaryColor: string | null;
}

/** Kalakosh (tenant #1) fallbacks — only used for the kalakosh tenant. */
export const KALAKOSH_BRANDING: Branding = {
  storeName: "Kalakosh Zürich",
  shortName: "Kalakosh",
  whatsappNumber: "41791721714",
  instagramHandle: "kalakoshzurich",
  contactEmail: "info@kalakosh.ch",
  logoUrl: "/kalakosh-logo-banner.png",
  logoUrlDark: "/kalakosh-logo-banner-dark.png",
  currency: "chf",
  primaryColor: "#2D2620",
};

/** Neutral fallbacks for any non-Kalakosh tenant: no borrowed contact channels. */
export const NEUTRAL_BRANDING: Branding = {
  storeName: "Store",
  shortName: "Store",
  whatsappNumber: null,
  instagramHandle: null,
  contactEmail: null,
  logoUrl: null,
  logoUrlDark: null,
  currency: "chf",
  primaryColor: "#2D2620",
};

/** Pick the right fallback set for a given tenant slug. */
export function defaultsForSlug(slug: string | null | undefined): Branding {
  return slug === "kalakosh" ? KALAKOSH_BRANDING : NEUTRAL_BRANDING;
}

export interface TenantSettingsLike {
  whiteLabelName?: string | null;
  whatsappNumber?: string | null;
  instagramHandle?: string | null;
  contactEmail?: string | null;
  logoUrl?: string | null;
  currency?: string | null;
  primaryColor?: string | null;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Merge tenant name + settings over the given fallback set into a Branding object.
 * Pass the fallbacks from `defaultsForSlug(slug)` so contact channels only fall
 * back to Kalakosh's for the Kalakosh tenant.
 */
export function brandingFrom(
  tenantName: string | null | undefined,
  settings: TenantSettingsLike | null | undefined,
  defaults: Branding = NEUTRAL_BRANDING,
): Branding {
  const storeName =
    settings?.whiteLabelName || tenantName || defaults.storeName;
  // primaryColor is only honored if it's a real 6-digit hex (the schema default
  // is "#000000" for new tenants — treat that as "unset" so we keep the default).
  const rawColor = settings?.primaryColor;
  const primaryColor =
    rawColor && HEX6.test(rawColor) && rawColor.toLowerCase() !== "#000000"
      ? rawColor
      : defaults.primaryColor;

  const logoUrl = settings?.logoUrl || defaults.logoUrl;

  return {
    storeName,
    shortName: storeName.split(" ")[0] || defaults.shortName,
    whatsappNumber: settings?.whatsappNumber ?? defaults.whatsappNumber,
    instagramHandle: settings?.instagramHandle ?? defaults.instagramHandle,
    contactEmail: settings?.contactEmail ?? defaults.contactEmail,
    logoUrl,
    // A tenant that supplies a single logo uses it on both light and dark;
    // Kalakosh keeps its dedicated dark-background variant.
    logoUrlDark: settings?.logoUrl || defaults.logoUrlDark,
    currency: settings?.currency || defaults.currency,
    primaryColor,
  };
}

export function whatsappHref(branding: Branding): string | null {
  if (!branding.whatsappNumber) return null;
  const handle = branding.instagramHandle
    ? ` (@${branding.instagramHandle})`
    : "";
  const message = encodeURIComponent(
    `Hi, I found ${branding.storeName}${handle} and I'd love to know more!`,
  );
  return `https://wa.me/${branding.whatsappNumber}?text=${message}`;
}

export function instagramHref(branding: Branding): string | null {
  return branding.instagramHandle
    ? `https://www.instagram.com/${branding.instagramHandle}`
    : null;
}
