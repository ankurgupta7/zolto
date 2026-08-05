import { useTranslation } from "react-i18next";
import { useTenant } from "@/contexts/TenantContext";
import { genericTermsSections, pageChrome } from "@/lib/storefrontContent";
import { matchSupportedLanguage } from "@/lib/languages";

export default function Policy() {
  const { branding } = useTenant();
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const sections = genericTermsSections(branding, lang);
  const chrome = pageChrome(branding, lang).terms;

  return (
    <div className="page-enter pt-20">
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {branding.storeName}
          </p>
          <h1 className="font-serif text-white">{chrome.title}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container max-w-3xl">
          <p className="text-muted-foreground font-sans leading-relaxed mb-10">
            {chrome.intro}
          </p>

          <div className="space-y-10">
            {sections.map((section) => (
              <div key={section.heading}>
                <h2 className="font-serif text-foreground text-xl mb-3">
                  {section.heading}
                </h2>
                <div className="space-y-3">
                  {section.body.map((para, i) => (
                    <p
                      key={i}
                      className="text-muted-foreground text-sm font-sans leading-relaxed"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 rounded border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-4 text-xs text-muted-foreground font-sans">
            {chrome.disclaimer}
          </p>
        </div>
      </section>
    </div>
  );
}
