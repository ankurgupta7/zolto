import { useState } from "react";
import { Link } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { whatsappHref } from "@/lib/branding";
import { genericFaq, type FaqItem } from "@/lib/storefrontContent";

function FaqSchema({ items }: { items: FaqItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="border border-[var(--brand-border)] bg-white"
      itemScope
      itemProp="mainEntity"
      itemType="https://schema.org/Question"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-[var(--brand-surface-2)] transition-colors"
        aria-expanded={isOpen}
      >
        <h3 className="font-serif text-foreground text-lg pr-4" itemProp="name">
          {item.question}
        </h3>
        <span
          className={`text-[var(--brand-accent)] text-xl font-serif flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </button>
      {isOpen && (
        <div
          className="px-6 pb-6 border-t border-[var(--brand-border)] pt-4"
          itemScope
          itemProp="acceptedAnswer"
          itemType="https://schema.org/Answer"
        >
          <p
            className="text-muted-foreground font-sans font-light leading-relaxed"
            itemProp="text"
          >
            {item.answer}
          </p>
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const { branding } = useTenant();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const items = genericFaq(branding);
  const waHref = whatsappHref(branding);

  return (
    <div className="page-enter pt-20">
      <FaqSchema items={items} />

      <section className="bg-[var(--brand-ink)] py-20">
        <div className="container text-center">
          <p className="text-[var(--brand-accent)] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            Frequently Asked Questions
          </p>
          <h1 className="font-serif text-white text-4xl md:text-5xl mb-4">
            How can we help?
          </h1>
          <p className="text-white/60 font-sans font-light max-w-xl mx-auto">
            Answers about payment, shipping, returns, and getting in touch with{" "}
            {branding.storeName}.
          </p>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container max-w-3xl mx-auto space-y-4">
          {items.map((item, i) => (
            <AccordionItem
              key={item.question}
              item={item}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </section>

      <section className="py-20 bg-[var(--brand-ink)] text-center">
        <div className="container">
          <h2 className="font-serif text-white text-3xl mb-4">
            Still have questions?
          </h2>
          <p className="text-white/60 font-sans font-light mb-8 max-w-lg mx-auto">
            Reach out — we usually reply within a day.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[var(--brand-accent)] text-[var(--brand-ink)] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[var(--brand-accent-light)] transition-colors duration-300"
              >
                WhatsApp
              </a>
            )}
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-colors duration-300"
            >
              Contact Form
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
