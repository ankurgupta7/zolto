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
