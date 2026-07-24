/**
 * Zolto pricing tiers for the marketing pricing page.
 *
 * The data now lives in the shared platform module (@shared/platform) so the
 * pricing page, SEO JSON-LD, /llms.txt, and the platform MCP tools all read the
 * same source. Re-exported here to keep existing imports (`../plans`) stable.
 */
export {
  PLANS,
  formatPrice,
  type PlatformPlan as Plan,
} from "@shared/platform";
