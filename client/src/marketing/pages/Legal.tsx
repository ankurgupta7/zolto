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
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-white">
        {title}
      </h1>
      <p className="mt-2 text-xs uppercase tracking-widest text-slate-500">
        {updated}
      </p>
      <p className="mt-6 text-slate-300">{intro}</p>
      <div className="mt-10 space-y-8">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-semibold text-white">{s.heading}</h2>
            <div className="mt-3 space-y-3">
              {s.body.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-slate-300">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-12 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
        This is a plain-language summary of Zolto's platform terms. It is not
        legal advice. Merchants remain responsible for their own storefront's
        customer-facing policies.
      </p>
    </div>
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
          heading: "3. Your rights",
          body: [
            "You may request access to, correction of, or deletion of your personal data, and you may object to certain processing. Contact us to exercise these rights. EU users additionally have the rights granted under the GDPR, including data portability and the right to lodge a complaint with a supervisory authority.",
          ],
        },
        {
          heading: "4. Retention & sub-processors",
          body: [
            "We keep data for as long as your account is active and as required by law. We use a small set of sub-processors (hosting, payments, email, AI) under contract; a current list is available on request.",
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
            "Prices are stated in euros. Applicable taxes — EU VAT (via the OSS scheme for cross-border digital services) or Swiss VAT — are determined by your location and shown at checkout. Whether a displayed price is inclusive or exclusive of tax is indicated at the point of sale.",
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
