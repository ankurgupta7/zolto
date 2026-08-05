export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * Product categories are per-tenant now: each store's list lives in the
 * `tenant_categories` table, seeded from the merchant's vertical preset
 * (shared/verticals.ts) and editable in admin → Categories. This alias
 * remains for call sites that still name the concept.
 */
export type ProductCategory = string;

/**
 * Where a new merchant sold before Zolto — signup's "already selling
 * somewhere?" answer, stored in tenant_settings.migrate_from. Drives the
 * onboarding checklist's bring-your-catalogue step toward the matching
 * importer (server/onboarding.ts → /admin/products/import).
 */
export const MIGRATE_FROM_PROVIDERS = [
  "stripe",
  "sumup",
  "worldline",
  "other",
] as const;
export type MigrateFromProvider = (typeof MIGRATE_FROM_PROVIDERS)[number];

/** Merchant-facing names for the switch-in sources. */
export const MIGRATE_FROM_LABELS: Record<MigrateFromProvider, string> = {
  stripe: "Stripe",
  sumup: "SumUp",
  worldline: "Worldline / SIX",
  other: "somewhere else",
};
