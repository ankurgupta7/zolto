import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useTenant } from "@/contexts/TenantContext";
import { genericAbout, pageChrome } from "@/lib/storefrontContent";
import { matchSupportedLanguage } from "@/lib/languages";

export default function About() {
  const { branding, content } = useTenant();
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const about = genericAbout(branding, lang, content);
  const chrome = pageChrome(branding, lang).about;

  return (
    <div className="page-enter pt-20">
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {branding.storeName}
          </p>
          <h1 className="font-serif text-white">{about.title}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-20 bg-background">
        {/* The measure lives on an inner wrapper, not on `.container` itself:
            `.container` is plain unlayered CSS (index.css) and its 1280px
            max-width beats any `max-w-*` utility placed beside it, whatever
            the class order. At 1280px a merchant's own story reads as a wall
            of text — the very thing this page now renders. */}
        <div className="container">
          <div className="mx-auto max-w-2xl">
            <div className="space-y-6">
              {about.paragraphs.map((para, i) => (
                <p
                  key={i}
                  className="text-muted-foreground font-sans font-light leading-relaxed text-base"
                >
                  {para}
                </p>
              ))}
            </div>

            <div className="mt-12 flex flex-wrap gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors duration-300"
              >
                {chrome.browseShop}
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 border border-[var(--brand-ink)]/30 text-[var(--brand-ink)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors duration-300"
              >
                {chrome.getInTouch}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
