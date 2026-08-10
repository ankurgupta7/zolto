/**
 * The "Made with Zolto" credit in a storefront's footer — the human-readable
 * half of shared/attribution.ts.
 *
 * Renders nothing when the store has opted out (white-label plans only) or
 * while the tenant queries are still in flight, so it never flashes onto a
 * white-labelled store. The server-injected `<meta name="generator">` and the
 * WebSite JSON-LD `creator` node carry the same claim for the AI crawlers that
 * never execute this component at all.
 *
 * A plain followable `<a>` on purpose: no `nofollow`, because the point of the
 * credit on a merchant's own custom domain is precisely that a search engine
 * follows it back to zolto.ch. `target="_blank"` keeps the shopper's session in
 * the shop, and `rel="noopener"` is the security floor that comes with it.
 */

import { useTranslation } from "react-i18next";
import { ZOLTO_ATTRIBUTION, zoltoAttributionHref } from "@shared/attribution";
import { useTenant } from "@/contexts/TenantContext";

export default function ZoltoCredit({
  className = "",
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const { showsZoltoCredit } = useTenant();
  if (!showsZoltoCredit) return null;

  return (
    <p className={`font-sans ${className}`.trim()} data-testid="zolto-credit">
      {/* The label is translated; the brand name never is, and it stays inside
          the anchor so the link text a crawler indexes is always "Zolto". */}
      {t("footer.madeWith")}{" "}
      <a
        href={zoltoAttributionHref("storefront-footer")}
        target="_blank"
        rel="noopener"
        title={t("footer.madeWithTitle", { platform: ZOLTO_ATTRIBUTION.name })}
        className="font-medium text-white/70 underline decoration-white/30 underline-offset-4 transition-colors duration-200 hover:text-[var(--brand-accent)] hover:decoration-[var(--brand-accent)]"
      >
        {ZOLTO_ATTRIBUTION.name}
      </a>
    </p>
  );
}
