import { Container } from "../components/Container";
import { useMarketingT } from "../lib/marketingI18n";

interface Section {
  heading: string;
  body: string[];
}

/**
 * The legal pages' copy lives in the marketing locale files
 * (marketing:legal.privacy / marketing:legal.terms) so the Privacy Policy and
 * Terms of Service render in the visitor's language like the rest of the
 * funnel. The section arrays are read with returnObjects — the structural
 * locale test guarantees every language carries the same sections.
 */
function LegalLayout({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
}) {
  const { t } = useMarketingT();
  return (
    <Container width="3xl" className="py-20">
      <h1 className="font-serif text-4xl text-[var(--brand-text)]">{title}</h1>
      <p className="mt-2 text-xs uppercase tracking-widest text-[var(--brand-muted)]">
        {updated}
      </p>
      <p className="mt-6 text-[var(--brand-muted-2)]">{intro}</p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-serif text-xl text-[var(--brand-text)]">
              {s.heading}
            </h2>
            <div className="mt-3 space-y-3">
              {s.body.map((p, i) => (
                <p
                  key={i}
                  className="text-sm leading-relaxed text-[var(--brand-muted-2)]"
                >
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-12 rounded-xl border border-[var(--brand-border)] bg-white p-4 text-xs text-[var(--brand-muted-2)]">
        {t("legal.disclaimer")}
      </p>
    </Container>
  );
}

export function Privacy() {
  const { t } = useMarketingT();
  const sections = t("legal.privacy.sections", {
    returnObjects: true,
  }) as unknown as Section[];
  return (
    <LegalLayout
      title={t("legal.privacy.title")}
      updated={t("legal.privacy.updated")}
      intro={t("legal.privacy.intro")}
      sections={sections}
    />
  );
}

export function Terms() {
  const { t } = useMarketingT();
  const sections = t("legal.terms.sections", {
    returnObjects: true,
  }) as unknown as Section[];
  return (
    <LegalLayout
      title={t("legal.terms.title")}
      updated={t("legal.terms.updated")}
      intro={t("legal.terms.intro")}
      sections={sections}
    />
  );
}
