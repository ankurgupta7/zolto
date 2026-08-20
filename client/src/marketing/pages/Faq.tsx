import { brandNeutralKey } from "@shared/brand";
import { Link } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { FAQ_CATEGORIES, faqsByCategory, PLATFORM } from "@shared/platform";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * The public FAQ. The answers already existed in shared/platform.ts and were
 * being emitted as FAQPage JSON-LD, into /llms.txt and over MCP — but had no
 * human-readable page, so a visitor (or an AI assistant following a link) had
 * nowhere to land. FAQ/resource pages are among the strongest performers for
 * AI referral traffic, and this content was already written.
 *
 * Rendered from the shared source (so the page, the schema, the LLM brief and
 * the MCP tool can never disagree on the facts), translated through the
 * marketing locale files keyed by the English question — with the shared
 * English string as fallback, so a newly added FAQ renders in English rather
 * than not at all.
 */
export default function Faq() {
  const { t, st } = useMarketingT();

  useDocumentMeta({
    title: t("faqPage.metaTitle", { name: PLATFORM.name }),
    description: t("faqPage.metaDescription", { name: PLATFORM.name }),
    path: "/faq",
  });

  return (
    <Container className="py-20">
      <div className="text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("faqPage.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {t("faqPage.heading")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--brand-muted-2)]">
          {t("faqPage.intro1")}{" "}
          <Link
            href="/signup"
            className="text-[var(--brand-accent)] hover:underline"
          >
            {t("faqPage.introLink")}
          </Link>{" "}
          {t("faqPage.intro2")}
        </p>
      </div>

      <div className="mx-auto mt-16 max-w-2xl space-y-14">
        {FAQ_CATEGORIES.map((category) => {
          const items = faqsByCategory(category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="font-serif text-2xl text-[var(--brand-text)]">
                {st(`faqCategories.${brandNeutralKey(category)}`, category)}
              </h2>
              <dl className="mt-6 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.q}
                    className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
                  >
                    <dt className="font-medium text-[var(--brand-text)]">
                      {st(`faqs.${brandNeutralKey(item.q)}.q`, item.q)}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                      {st(`faqs.${brandNeutralKey(item.q)}.a`, item.a)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <div className="mx-auto mt-20 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-8 text-center">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          {t("faqPage.readyHeading")}
        </h2>
        <p className="mt-3 text-sm text-[var(--brand-muted-2)]">
          {st("platform.pricingSummary", PLATFORM.pricingSummary)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("faqPage.startFree")}
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--brand-ink)]/25 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("faqPage.seePricing")}
          </Link>
        </div>
      </div>
    </Container>
  );
}
