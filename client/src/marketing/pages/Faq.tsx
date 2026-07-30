import { Link } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { FAQ_CATEGORIES, faqsByCategory, PLATFORM } from "@shared/platform";

/**
 * The public FAQ. The answers already existed in shared/platform.ts and were
 * being emitted as FAQPage JSON-LD, into /llms.txt and over MCP — but had no
 * human-readable page, so a visitor (or an AI assistant following a link) had
 * nowhere to land. FAQ/resource pages are among the strongest performers for
 * AI referral traffic, and this content was already written.
 *
 * Rendered straight from the shared source so the page, the schema, the LLM
 * brief and the MCP tool can never disagree.
 */
export default function Faq() {
  useDocumentMeta({
    title: `FAQ — ${PLATFORM.name}`,
    description: `Answers to the questions makers ask about ${PLATFORM.name}: what it costs, how setup works, getting paid, and selling in person and online.`,
    path: "/faq",
  });

  return (
    <Container className="py-20">
      <div className="text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          straight answers
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          Frequently asked questions
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--brand-muted-2)]">
          Everything makers ask before opening a store. Still stuck?{" "}
          <Link
            href="/signup"
            className="text-[var(--brand-accent)] hover:underline"
          >
            Start free
          </Link>{" "}
          — it costs nothing to look around.
        </p>
      </div>

      <div className="mx-auto mt-16 max-w-2xl space-y-14">
        {FAQ_CATEGORIES.map((category) => {
          const items = faqsByCategory(category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="font-serif text-2xl text-[var(--brand-text)]">
                {category}
              </h2>
              <dl className="mt-6 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.q}
                    className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
                  >
                    <dt className="font-medium text-[var(--brand-text)]">
                      {item.q}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                      {item.a}
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
          Ready to open your store?
        </h2>
        <p className="mt-3 text-sm text-[var(--brand-muted-2)]">
          {PLATFORM.pricingSummary}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--brand-ink)]/25 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            See pricing
          </Link>
        </div>
      </div>
    </Container>
  );
}
