/**
 * Trustpilot — what the storefront and the admin ask about a store's profile.
 *
 * `summary` is public because everything it returns is public: a Trustpilot
 * profile URL and a published star rating. It reads the tenant from the request
 * host, so a storefront can only ever ask about itself.
 *
 * The API key never appears in any response here. `status` tells the admin
 * whether the platform HAS one — that is the difference between "your profile
 * is connected but Zolto can't fetch ratings" and "your profile is wrong", and
 * a merchant staring at a link with no stars deserves to be told which.
 */

import { TRPCError } from "@trpc/server";
import {
  normaliseTrustpilotDomain,
  trustpilotEvaluateUrl,
  trustpilotProfileUrl,
} from "@shared/trustpilot";
import { publicProcedure, router, tenantAdminProcedure } from "../_core/trpc";
import { getTenantSettings } from "../db";
import { fetchTrustpilotSummary, isTrustpilotConfigured } from "../trustpilot";

export const trustpilotRouter = router({
  /**
   * Public: this storefront's Trustpilot standing.
   *
   * Returns `connected: false` for the overwhelming majority of stores, which
   * have no profile — the storefront renders nothing at all in that case. A
   * connected store always gets its links; `summary` is null when the platform
   * has no API key, when Trustpilot is unreachable, or when nobody has reviewed
   * the store yet, and the band then shows the link without stars rather than
   * disappearing.
   */
  summary: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.tenant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    const settings = await getTenantSettings(ctx.tenant.id);
    const domain = normaliseTrustpilotDomain(settings?.trustpilotDomain);
    if (!domain) return { connected: false as const };

    const showRating = settings?.trustpilotShowRating ?? true;
    return {
      connected: true as const,
      domain,
      profileUrl: trustpilotProfileUrl(domain),
      reviewUrl: trustpilotEvaluateUrl(domain),
      summary: showRating ? await fetchTrustpilotSummary(domain) : null,
    };
  }),

  /**
   * Admin: the same lookup plus why it might be empty. `ratingsAvailable`
   * distinguishes a platform with no Trustpilot API key (stars can never show,
   * whatever the merchant does) from a domain Trustpilot doesn't recognise
   * (which the merchant can fix).
   */
  status: tenantAdminProcedure.query(async ({ ctx }) => {
    const settings = await getTenantSettings(ctx.tenant.id);
    const domain = normaliseTrustpilotDomain(settings?.trustpilotDomain);
    return {
      ratingsAvailable: isTrustpilotConfigured(),
      domain,
      showRating: settings?.trustpilotShowRating ?? true,
      profileUrl: domain ? trustpilotProfileUrl(domain) : null,
      reviewUrl: domain ? trustpilotEvaluateUrl(domain) : null,
      summary: domain ? await fetchTrustpilotSummary(domain) : null,
    };
  }),
});
