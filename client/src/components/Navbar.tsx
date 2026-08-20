import { BRAND } from "@shared/brand";
import { useAuth } from "@/_core/hooks/useAuth";
import { isStoreAdminRole } from "@/admin/nav";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ShoppingBag } from "lucide-react";
import i18n from "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  SUPPORTED_LANGUAGES,
  matchSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/languages";
import { useCart } from "@/contexts/CartContext";
import { useTenant } from "@/contexts/TenantContext";
import { instagramHref } from "@/lib/branding";

const InstagramIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-4 h-4"
    aria-hidden="true"
  >
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

function LanguageSwitcher() {
  const { i18n: i18nInst } = useTranslation();
  const currentLang =
    matchSupportedLanguage(i18nInst.language) ?? DEFAULT_LANGUAGE;

  const switchTo = (next: SupportedLanguage) => {
    i18n.changeLanguage(next);
    localStorage.setItem(BRAND.langKey, next);
    document.documentElement.lang = HTML_LANG[next];
  };

  return (
    <select
      value={currentLang}
      onChange={(e) => switchTo(e.target.value as SupportedLanguage)}
      aria-label="Switch language"
      className="text-xs uppercase tracking-[0.15em] font-sans transition-colors duration-200 border px-2 py-1 bg-transparent cursor-pointer appearance-none text-[var(--brand-text)]/50 border-[var(--brand-text)]/15 hover:text-[var(--brand-accent)] hover:border-[var(--brand-accent)]"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang} className="text-black">
          {lang.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function CartButton({ compact = false }: { compact?: boolean }) {
  const { count, openCart } = useCart();
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label="Open shopping bag"
      className={`relative transition-colors duration-200 ${
        compact
          ? "text-[var(--brand-text)]/70 p-2"
          : "text-[var(--brand-text)]/70 hover:text-[var(--brand-accent)]"
      }`}
    >
      <ShoppingBag className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--brand-ground)] text-[10px] font-sans font-semibold leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

export default function Navbar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { branding } = useTenant();
  const igHref = instagramHref(branding);

  const NAV_LINKS = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.shop"), href: "/shop" },
    { label: t("nav.about"), href: "/about" },
    { label: t("nav.faq"), href: "/faq" },
    { label: t("nav.contact"), href: "/contact" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the mobile menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const isAdmin = isStoreAdminRole(user?.role);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-[var(--brand-ground)] ${
        scrolled
          ? "shadow-sm shadow-black/6 border-b border-[var(--brand-border-2)]"
          : "border-b border-[var(--brand-border-2)]/60"
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo — black on white, no inversion needed */}
          <Link href="/" className="flex items-center group">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.storeName}
                className="h-14 md:h-18 w-auto object-contain"
              />
            ) : (
              <span className="font-serif text-2xl text-[var(--brand-text)]">
                {branding.storeName}
              </span>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 ${
                  location === link.href
                    ? "text-[var(--brand-accent)]"
                    : "text-[var(--brand-text)]/60 hover:text-[var(--brand-accent)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Link
                  href="/admin"
                  className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 border border-[var(--brand-accent)]/30 px-3 py-1 ${
                    location === "/admin"
                      ? "text-[var(--brand-accent)] border-[var(--brand-accent)]"
                      : "text-[var(--brand-accent)]/60 hover:text-[var(--brand-accent)] hover:border-[var(--brand-accent)]"
                  }`}
                >
                  {t("nav.admin")}
                </Link>
                <Link
                  href="/admin/bulk-upload"
                  title="Bulk Upload"
                  className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 border border-[var(--brand-accent)]/30 px-3 py-1 flex items-center gap-1 ${
                    location === "/admin/bulk-upload"
                      ? "text-[var(--brand-accent)] border-[var(--brand-accent)]"
                      : "text-[var(--brand-accent)]/60 hover:text-[var(--brand-accent)] hover:border-[var(--brand-accent)]"
                  }`}
                >
                  {t("nav.upload")}
                </Link>
              </div>
            )}
            <LanguageSwitcher />
            <a
              href={igHref ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${branding.storeName} on Instagram`}
              className="text-[var(--brand-text)]/40 hover:text-[var(--brand-accent)] transition-colors duration-200"
            >
              <InstagramIcon />
            </a>
            <CartButton />
          </nav>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-1">
            <CartButton compact />
            <button
              type="button"
              className="flex flex-col gap-1.5 p-2 text-[var(--brand-text)]/70"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <span
                className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu — dark panel that drops below the light bar */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen
            ? "max-h-96 border-t border-[var(--brand-border-2)]"
            : "max-h-0"
        }`}
      >
        <nav className="container bg-[var(--brand-ground)] py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`py-3 text-sm uppercase tracking-[0.15em] font-sans border-b border-[var(--brand-border-2)] transition-colors ${
                location === link.href
                  ? "text-[var(--brand-accent)]"
                  : "text-[var(--brand-text)]/60"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="py-3 text-sm uppercase tracking-[0.15em] font-sans text-[var(--brand-accent)] border-b border-[var(--brand-border-2)]"
              >
                {t("nav.admin")}
              </Link>
              <Link
                href="/admin/bulk-upload"
                className="py-3 text-sm uppercase tracking-[0.15em] font-sans text-[var(--brand-accent)]/70 border-b border-[var(--brand-border-2)] flex items-center gap-2"
              >
                {t("nav.bulkUpload")}
              </Link>
            </>
          )}
          <div className="py-3 border-b border-[var(--brand-border-2)]">
            <LanguageSwitcher />
          </div>
          <a
            href={igHref ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3 flex items-center gap-2 text-sm uppercase tracking-[0.15em] font-sans text-[var(--brand-text)]/40 border-b border-[var(--brand-border-2)]"
          >
            <InstagramIcon />
            Instagram
          </a>
        </nav>
      </div>
    </header>
  );
}
