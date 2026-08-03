import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTenant } from "@/contexts/TenantContext";
import { instagramHref, whatsappHref } from "@/lib/branding";
import { useCategories } from "@/hooks/useCategories";

const InstagramIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

export default function Footer() {
  const { t } = useTranslation();
  const { branding } = useTenant();
  const igHref = instagramHref(branding);
  const waHref = whatsappHref(branding);
  const { data: allProducts } = trpc.products.list.useQuery({});
  const availableCategories = useMemo(
    () => new Set(allProducts?.map((p) => p.category) ?? []),
    [allProducts],
  );

  const NAV_LINKS = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.shop"), href: "/shop" },
    { label: t("nav.about"), href: "/about" },
    { label: t("nav.contact"), href: "/contact" },
  ];

  // The store's own categories (server-driven); folded categories like the
  // jewellery "Sets" and the catch-all "Other" don't get their own link.
  const { categories, label } = useCategories();
  const COLLECTION_LINKS = useMemo(() => {
    const folded = new Set(categories.flatMap((c) => c.extraIncludes));
    return categories
      .filter((c) => c.key !== "Other" && !folded.has(c.key))
      .map((c) => ({ label: label(c.key), name: c.key }));
  }, [categories, label]);

  return (
    <footer className="bg-[var(--brand-ink)] text-white/70">
      <div className="divider-gold" />

      {/* Instagram Follow Banner — only when this tenant has a handle. */}
      {igHref && (
        <div className="border-b border-white/10">
          <div className="container py-8">
            <a
              href={igHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left"
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                <InstagramIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-white font-serif text-lg leading-tight">
                  {t("footer.instagramBanner")}
                </p>
                <p className="text-[var(--brand-accent)] text-sm font-sans tracking-wide mt-0.5">
                  @{branding.instagramHandle}
                </p>
              </div>
              <span className="sm:ml-auto flex items-center gap-2 bg-white/10 border border-white/20 text-white text-xs uppercase tracking-[0.15em] font-sans px-5 py-2.5 group-hover:bg-[var(--brand-accent)] group-hover:text-[var(--brand-ink)] group-hover:border-[var(--brand-accent)] transition-all duration-200">
                <InstagramIcon className="w-3.5 h-3.5" />
                {t("footer.instagramFollow")}
              </span>
            </a>
          </div>
        </div>
      )}

      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <div className="mb-4">
              {branding.logoUrlDark ? (
                <img
                  src={branding.logoUrlDark}
                  alt={branding.storeName}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <span className="font-serif text-2xl text-white">
                  {branding.storeName}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-white/50 max-w-xs mb-5">
              {t("footer.tagline")}
            </p>
            {(igHref || waHref) && (
              <div className="flex items-center gap-3">
                {igHref && (
                  <a
                    href={igHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${branding.storeName} on Instagram`}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-gradient-to-br hover:from-[#f09433] hover:via-[#dc2743] hover:to-[#bc1888] hover:text-white transition-all duration-200"
                  >
                    <InstagramIcon className="w-4 h-4" />
                  </a>
                )}
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Chat on WhatsApp"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-[#25D366] hover:text-white transition-all duration-200"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-4 h-4"
                      aria-hidden="true"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    <span className="sr-only">Chat on WhatsApp</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-[var(--brand-accent)] mb-4 font-sans">
              {t("footer.navigation")}
            </h4>
            <ul className="space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-[var(--brand-accent)] transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Collections + Follow */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-[var(--brand-accent)] mb-4 font-sans">
              {t("footer.collections")}
            </h4>
            <ul className="space-y-2 mb-6">
              {COLLECTION_LINKS.filter((cat) =>
                availableCategories.has(cat.name),
              ).map((cat) => (
                <li key={cat.name}>
                  <Link
                    href={`/shop?category=${encodeURIComponent(cat.name)}`}
                    className="text-sm text-white/60 hover:text-[var(--brand-accent)] transition-colors duration-200"
                  >
                    {cat.label}
                  </Link>
                </li>
              ))}
            </ul>

            {igHref && (
              <>
                <h4 className="text-xs uppercase tracking-[0.2em] text-[var(--brand-accent)] mb-3 font-sans">
                  {t("footer.followUs")}
                </h4>
                <a
                  href={igHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-[var(--brand-accent)] transition-colors duration-200"
                >
                  <InstagramIcon className="w-4 h-4" />@
                  {branding.instagramHandle}
                </a>
              </>
            )}
          </div>
        </div>

        <div className="divider-gold my-8 opacity-30" />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-white/30">
          <p>
            {t("footer.copyright", {
              year: new Date().getFullYear(),
              store: branding.storeName,
            })}
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/policy"
              className="text-white/40 hover:text-[var(--brand-accent)] transition-colors duration-200"
            >
              {t("footer.policy")}
            </Link>
            <Link
              href="/impressum"
              className="text-white/40 hover:text-[var(--brand-accent)] transition-colors duration-200"
            >
              {t("footer.impressum")}
            </Link>
            <p className="font-serif italic text-[var(--brand-accent)]/40">
              {t("footer.swissQuality")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
