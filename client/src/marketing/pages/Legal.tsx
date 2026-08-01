import { Container } from "../components/Container";
import { DATA_RESIDENCY } from "@shared/platform";

interface Section {
  heading: string;
  body: string[];
}

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
        This is a plain-language summary of Zolto's platform terms. It is not
        legal advice. Merchants remain responsible for their own storefront's
        customer-facing policies.
      </p>
    </Container>
  );
}

export function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="Draft — pending legal review"
      intro="This policy explains what data Zolto processes when you use the platform to run a store. It covers Zolto's role as the platform provider; each merchant is the controller for their own customers' data."
      sections={[
        {
          heading: "1. Two data-protection regimes apply",
          body: [
            "Zolto serves merchants in Switzerland and the EU, and these are governed by different laws. Swiss merchants and their customers are covered by the revised Swiss Federal Act on Data Protection (revFADP/nFADP). EU merchants and customers are covered by the GDPR. We apply the stricter of the two where they differ.",
            "Where we act as a processor for a merchant (handling their customers' data on their behalf), a Data Processing Agreement governs that relationship.",
          ],
        },
        {
          heading: "2. What we collect",
          body: [
            "Account data: your name, email, store name, and login credentials. Store data: products, orders, and inventory you enter. Usage data: how you interact with the platform, to improve it and provide support.",
            "Payment card details are handled directly by our payment processor (Stripe) and are never stored on Zolto's servers.",
          ],
        },
        {
          // The residency facts come from DATA_RESIDENCY so this page, the
          // landing band, the FAQ and the llms/MCP briefs can never end up
          // describing different countries.
          heading: "3. Where your data lives",
          body: [
            `${DATA_RESIDENCY.body} ${DATA_RESIDENCY.points[1]}`,
            DATA_RESIDENCY.caveat,
          ],
        },
        {
          heading: "4. Your rights",
          body: [
            "You may request access to, correction of, or deletion of your personal data, and you may object to certain processing. Contact us to exercise these rights. EU users additionally have the rights granted under the GDPR, including data portability and the right to lodge a complaint with a supervisory authority.",
          ],
        },
        {
          heading: "5. Retention & sub-processors",
          body: [
            `We keep data for as long as your account is active and as required by law. We use a small set of sub-processors under contract: hosting (${DATA_RESIDENCY.provider}, ${DATA_RESIDENCY.region}), payments (Stripe), transactional email, and the AI model provider behind the assistant features. A current list is available on request.`,
          ],
        },
      ]}
    />
  );
}

export function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="Draft — pending legal review"
      intro="These terms govern your use of the Zolto platform to operate an online store and point-of-sale."
      sections={[
        {
          heading: "1. Subscriptions & trials",
          body: [
            "Paid plans are billed monthly and are month-to-month — cancel anytime, effective at the next billing cycle. Paid features may include a 14-day free trial. After the trial, the plan renews at the then-current price unless cancelled.",
          ],
        },
        {
          heading: "2. Prices and taxes",
          body: [
            "Prices are stated in Swiss francs (CHF). Zolto's turnover is below the CHF 100,000 threshold at which Swiss VAT registration becomes mandatory, so no VAT is charged on subscriptions or on the platform fee — the price shown is the price you pay. Should Zolto cross that threshold, or become liable for tax in another jurisdiction, we will update these terms and notify affected customers before any tax is applied.",
          ],
        },
        {
          heading: "3. AI-assisted features",
          body: [
            "Zolto includes AI features that draft product descriptions, answer support questions, and speed up setup. AI output can be inaccurate — you are responsible for reviewing content before it goes live to your customers. Changes that affect billing, payments, or inventory are always applied by a human, never auto-deployed by the assistant.",
          ],
        },
        {
          heading: "4. Your responsibilities",
          body: [
            "You are responsible for the legality of what you sell, for your storefront's own customer-facing policies (returns, shipping, privacy), and for the accuracy of your product and inventory data.",
          ],
        },
        {
          heading: "5. Liability & governing law",
          body: [
            "The platform is provided on an as-is basis to the extent permitted by law. These terms are governed by Swiss law; mandatory consumer-protection rights in your country of residence are unaffected.",
          ],
        },
      ]}
    />
  );
}
