import { useTranslation } from "react-i18next";

/**
 * Legal Notice (Impressum). Values taken from the Commercial Register of the
 * Canton of Zürich (Atelier by Arora, sole proprietorship).
 */
const COMPANY = "Atelier by Arora";
const BRAND = "Kalakosh Zürich";
const OWNER = "Sheena Arora";
const STREET = "c/o Sheena Arora, Seestrasse 95";
const POSTCODE_TOWN = "8702 Zollikon";
const COUNTRY_DE = "Schweiz";
const COUNTRY_EN = "Switzerland";
const UID = "CHE-293.833.000";
const EMAIL = "info@kalakosh.ch";
const PHONE = "+41 79 172 17 14";

interface Row {
  label: string;
  value: string;
  href?: string;
}

const CONTENT: Record<"de" | "en", { title: string; rows: Row[]; vatNote: string; disclaimerHeading: string; disclaimer: string }> = {
  de: {
    title: "Impressum",
    rows: [
      { label: "Firma", value: `${COMPANY} (Marke «${BRAND}»)` },
      { label: "Rechtsform", value: "Einzelunternehmen" },
      { label: "Inhaberin", value: OWNER },
      { label: "Adresse", value: `${STREET}, ${POSTCODE_TOWN}, ${COUNTRY_DE}` },
      { label: "E-Mail", value: EMAIL, href: `mailto:${EMAIL}` },
      { label: "Telefon", value: PHONE, href: `tel:${PHONE.replace(/\s/g, "")}` },
      { label: "Unternehmens-Identifikationsnummer (UID)", value: UID },
    ],
    vatNote:
      "Als Kleinunternehmen sind wir nicht mehrwertsteuerpflichtig; auf unseren Preisen wird keine MWST erhoben oder ausgewiesen.",
    disclaimerHeading: "Haftungsausschluss",
    disclaimer:
      "Alle Inhalte dieser Website werden mit grösstmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte übernehmen wir jedoch keine Gewähr.",
  },
  en: {
    title: "Legal Notice",
    rows: [
      { label: "Company", value: `${COMPANY} (brand “${BRAND}”)` },
      { label: "Legal form", value: "Sole proprietorship" },
      { label: "Owner", value: OWNER },
      { label: "Address", value: `${STREET}, ${POSTCODE_TOWN}, ${COUNTRY_EN}` },
      { label: "Email", value: EMAIL, href: `mailto:${EMAIL}` },
      { label: "Phone", value: PHONE, href: `tel:${PHONE.replace(/\s/g, "")}` },
      { label: "Business Identification Number (UID)", value: UID },
    ],
    vatNote:
      "As a small business we are not registered for VAT; no Value Added Tax is charged or shown on our prices.",
    disclaimerHeading: "Disclaimer",
    disclaimer:
      "All content on this website is prepared with the greatest possible care. We accept no liability, however, for the accuracy, completeness or timeliness of the content.",
  },
};

export default function Impressum() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "de";
  const content = CONTENT[lang];

  return (
    <div className="page-enter pt-20">
      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            Kalakosh Zürich
          </p>
          <h1 className="font-serif text-white">{content.title}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container max-w-2xl">
          <dl className="space-y-5">
            {content.rows.map((row) => (
              <div key={row.label} className="border-b border-[var(--brand-border)] pb-4">
                <dt className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-sans mb-1">
                  {row.label}
                </dt>
                <dd className="text-foreground font-sans text-sm">
                  {row.href ? (
                    <a href={row.href} className="text-[var(--brand-ink)] hover:text-[var(--brand-accent)] transition-colors">
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground text-sm font-sans leading-relaxed mt-8">
            {content.vatNote}
          </p>

          <div className="mt-10">
            <h2 className="font-serif text-foreground text-xl mb-3">{content.disclaimerHeading}</h2>
            <p className="text-muted-foreground text-sm font-sans leading-relaxed">{content.disclaimer}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
