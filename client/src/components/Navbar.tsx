import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ShoppingBag } from "lucide-react";
import i18n from "@/lib/i18n";
import { useCart } from "@/contexts/CartContext";

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
  </svg>
);

function LanguageSwitcher() {
  const { i18n: i18nInst } = useTranslation();
  const currentLang = i18nInst.language;

  const toggle = () => {
    const next = currentLang === "de" ? "en" : "de";
    i18n.changeLanguage(next);
    localStorage.setItem("kalakosh_lang", next);
    document.documentElement.lang = next === "de" ? "de-CH" : "en";
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch language"
      className="text-xs uppercase tracking-[0.15em] font-sans transition-colors duration-200 border px-2 py-1 text-[#1C1714]/50 border-[#1C1714]/15 hover:text-[#B8963E] hover:border-[#B8963E]"
    >
      {currentLang === "de" ? "EN" : "DE"}
    </button>
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
          ? "text-[#1C1714]/70 p-2"
          : "text-[#1C1714]/70 hover:text-[#B8963E]"
      }`}
    >
      <ShoppingBag className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[#B8963E] text-[#F7F3EE] text-[10px] font-sans font-semibold leading-none">
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

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const isAdmin = user?.role === "admin";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-[#F7F3EE] ${
        scrolled
          ? "shadow-sm shadow-black/6 border-b border-[#DDD4C9]"
          : "border-b border-[#DDD4C9]/60"
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo — black on white, no inversion needed */}
          <Link href="/" className="flex items-center group">
            <img
              src="/kalakosh-logo-banner.png"
              alt="Kalakosh Zürich"
              className="h-14 md:h-18 w-auto object-contain"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 ${
                  location === link.href
                    ? "text-[#B8963E]"
                    : "text-[#1C1714]/60 hover:text-[#B8963E]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Link
                  href="/admin"
                  className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 border border-[#B8963E]/30 px-3 py-1 ${
                    location === "/admin"
                      ? "text-[#B8963E] border-[#B8963E]"
                      : "text-[#B8963E]/60 hover:text-[#B8963E] hover:border-[#B8963E]"
                  }`}
                >
                  {t("nav.admin")}
                </Link>
                <Link
                  href="/admin/bulk-upload"
                  title="Bulk Upload"
                  className={`text-sm uppercase tracking-[0.15em] font-sans transition-colors duration-200 border border-[#B8963E]/30 px-3 py-1 flex items-center gap-1 ${
                    location === "/admin/bulk-upload"
                      ? "text-[#B8963E] border-[#B8963E]"
                      : "text-[#B8963E]/60 hover:text-[#B8963E] hover:border-[#B8963E]"
                  }`}
                >
                  {t("nav.upload")}
                </Link>
              </div>
            )}
            <LanguageSwitcher />
            <a
              href="https://www.instagram.com/kalakoshzurich"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kalakosh Zürich on Instagram"
              className="text-[#1C1714]/40 hover:text-[#B8963E] transition-colors duration-200"
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
              className="flex flex-col gap-1.5 p-2 text-[#1C1714]/70"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <span className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-6 h-0.5 bg-current transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu — dark panel that drops below the light bar */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? "max-h-96 border-t border-[#DDD4C9]" : "max-h-0"
        }`}
      >
        <nav className="container bg-[#F7F3EE] py-4 flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`py-3 text-sm uppercase tracking-[0.15em] font-sans border-b border-[#DDD4C9] transition-colors ${
                location === link.href ? "text-[#B8963E]" : "text-[#1C1714]/60"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="py-3 text-sm uppercase tracking-[0.15em] font-sans text-[#B8963E] border-b border-[#DDD4C9]"
              >
                {t("nav.admin")}
              </Link>
              <Link
                href="/admin/bulk-upload"
                className="py-3 text-sm uppercase tracking-[0.15em] font-sans text-[#B8963E]/70 border-b border-[#DDD4C9] flex items-center gap-2"
              >
                {t("nav.bulkUpload")}
              </Link>
            </>
          )}
          <div className="py-3 border-b border-[#DDD4C9]">
            <LanguageSwitcher />
          </div>
          <a
            href="https://www.instagram.com/kalakoshzurich"
            target="_blank"
            rel="noopener noreferrer"
            className="py-3 flex items-center gap-2 text-sm uppercase tracking-[0.15em] font-sans text-[#1C1714]/40 border-b border-[#DDD4C9]"
          >
            <InstagramIcon />
            Instagram
          </a>
        </nav>
      </div>
    </header>
  );
}
