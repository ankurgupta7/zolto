import { useTranslation } from "react-i18next";

interface Section {
  heading: string;
  body: string[];
}

const RETURN_EMAIL = "return@kalakosh.ch";

const CONTENT: Record<"de" | "en", { title: string; intro: string; updated: string; sections: Section[] }> = {
  de: {
    title: "Verkaufs- und Geschäftsbedingungen",
    updated: "Zuletzt aktualisiert: Juni 2026",
    intro:
      "Diese Allgemeinen Geschäftsbedingungen (AGB) regeln den Verkauf von Schmuckstücken über den Online-Shop von Kalakosh Zürich. Mit der Aufgabe einer Bestellung erklären Sie sich mit diesen Bedingungen einverstanden.",
    sections: [
      {
        heading: "1. Anbieterin und Geltungsbereich",
        body: [
          "Anbieterin ist Atelier by Arora (Marke «Kalakosh Zürich») mit Sitz in Zürich, Schweiz. Diese AGB gelten für alle Bestellungen, die über unseren Online-Shop getätigt werden.",
        ],
      },
      {
        heading: "2. Preise",
        body: [
          "Alle Preise verstehen sich in Schweizer Franken (CHF) und sind Endpreise. Da wir als Kleinunternehmen nicht mehrwertsteuerpflichtig sind, wird keine Mehrwertsteuer (MWST) erhoben oder ausgewiesen. Versandkosten werden vor Abschluss der Bestellung gesondert ausgewiesen (siehe Ziffer 5).",
        ],
      },
      {
        heading: "3. Vertragsabschluss",
        body: [
          "Die Darstellung der Produkte im Shop stellt kein verbindliches Angebot dar. Mit dem Abschluss der Zahlung geben Sie ein verbindliches Kaufangebot ab. Der Kaufvertrag kommt mit unserer Bestätigung bzw. mit dem Versand des Schmuckstücks zustande.",
          "Jedes Stück ist ein handgefertigtes Unikat und nur einmal verfügbar.",
        ],
      },
      {
        heading: "4. Zahlungsmittel",
        body: [
          "Die Zahlung erfolgt sicher über unseren Zahlungsdienstleister Stripe. Wir akzeptieren Kredit- und Debitkarten (Visa, Mastercard, American Express) sowie TWINT. Ihre Kartendaten werden ausschliesslich von Stripe verarbeitet und gelangen nicht zu uns.",
        ],
      },
      {
        heading: "5. Lieferung und Versand",
        body: [
          "Wir versenden ausschliesslich innerhalb der Schweiz. Bei Bestellungen ab CHF 50 ist der Versand kostenlos; bei Bestellungen unter CHF 50 wird eine Versandpauschale von CHF 2 erhoben.",
          "Der Versand erfolgt in der Regel innerhalb von 2–3 Werktagen nach Zahlungseingang. Sollte es zu einer Verzögerung kommen, informieren wir Sie umgehend. Die Lieferadresse wird während des Bezahlvorgangs erfasst. Das Eigentum am Schmuckstück geht erst mit vollständiger Bezahlung auf Sie über (Eigentumsvorbehalt).",
        ],
      },
      {
        heading: "6. Rückgabe und Rückerstattung",
        body: [
          `Sie können ein gekauftes Stück innerhalb von 14 Tagen nach Erhalt zurückgeben, sofern es ungetragen, unbeschädigt und im Originalzustand ist. Bitte schreiben Sie uns vorgängig an ${RETURN_EMAIL}. Die Rücksendung muss auf Ihre Kosten mit einer verfolgbaren Versandart (z. B. Einschreiben) erfolgen an: Atelier by Arora, c/o Sheena Arora, Seestrasse 95, 8702 Zollikon, Schweiz.`,
          "Sobald das Stück ungetragen und unbeschädigt bei uns eintrifft, erstatten wir Ihnen den Kaufpreis innerhalb von 5 Werktagen zurück. Getragene oder vom Kunden beschädigte Schmuckstücke sind von der Rückgabe und Rückerstattung ausgeschlossen.",
          `Sollte ein Stück beschädigt bei Ihnen ankommen, ersetzen oder erstatten wir es vollständig. Der Transportschaden muss jedoch lückenlos dokumentiert und nachgewiesen werden (z. B. durch Fotos unmittelbar nach Erhalt). Bitte melden Sie solche Schäden innerhalb von 48 Stunden nach Erhalt an ${RETURN_EMAIL}.`,
        ],
      },
      {
        heading: "7. Gewährleistung",
        body: [
          "Es gelten die gesetzlichen Gewährleistungsbestimmungen nach Schweizer Obligationenrecht. Da unsere Stücke von Hand gefertigt werden, sind kleine Abweichungen in Farbe, Form und Maserung der Steine und Perlen natürlich und stellen keinen Mangel dar.",
        ],
      },
      {
        heading: "8. Datenschutz",
        body: [
          "Wir verarbeiten Ihre personenbezogenen Daten (Name, Liefer- und Rechnungsadresse, E-Mail-Adresse, Telefonnummer sowie Bestelldaten) ausschliesslich zur Abwicklung Ihrer Bestellung und gemäss den geltenden datenschutzrechtlichen Bestimmungen.",
          "Die Zahlungsabwicklung erfolgt durch unseren Zahlungsdienstleister Stripe. Ihre vollständigen Kartendaten werden ausschliesslich von Stripe verarbeitet und sind für uns zu keinem Zeitpunkt einsehbar.",
          "Wir geben Ihre Daten nicht an unberechtigte Dritte weiter und bewahren sie nur so lange auf, wie dies für die Vertragsabwicklung und gesetzliche Aufbewahrungspflichten erforderlich ist.",
        ],
      },
      {
        heading: "9. Anwendbares Recht und Gerichtsstand",
        body: [
          "Es gilt ausschliesslich Schweizer Recht. Gerichtsstand ist Zürich, Schweiz, soweit gesetzlich zulässig.",
        ],
      },
    ],
  },
  en: {
    title: "Sales & Terms of Service",
    updated: "Last updated: June 2026",
    intro:
      "These Terms and Conditions govern the sale of jewellery pieces through the Kalakosh Zürich online shop. By placing an order you agree to these terms.",
    sections: [
      {
        heading: "1. Seller and Scope",
        body: [
          "The seller is Atelier by Arora (brand “Kalakosh Zürich”), based in Zurich, Switzerland. These terms apply to all orders placed through our online shop.",
        ],
      },
      {
        heading: "2. Prices",
        body: [
          "All prices are in Swiss Francs (CHF) and are final. As a small business that is not registered for VAT, we do not charge or show any Value Added Tax. Shipping costs are shown separately before you complete your order (see section 5).",
        ],
      },
      {
        heading: "3. Formation of Contract",
        body: [
          "The presentation of products in the shop does not constitute a binding offer. By completing payment you submit a binding offer to purchase. The contract of sale is concluded upon our confirmation or upon dispatch of the piece.",
          "Each piece is a handcrafted one-of-a-kind item and is available only once.",
        ],
      },
      {
        heading: "4. Payment Methods",
        body: [
          "Payment is processed securely through our payment provider Stripe. We accept credit and debit cards (Visa, Mastercard, American Express) and TWINT. Your card details are handled exclusively by Stripe and are never seen by us.",
        ],
      },
      {
        heading: "5. Delivery and Shipping",
        body: [
          "We ship within Switzerland only. Shipping is free for orders of CHF 50 or more; for orders under CHF 50 a flat shipping fee of CHF 2 applies.",
          "Orders are usually dispatched within 2–3 business days of payment. Should there be any delay, we will notify you promptly. Your delivery address is collected during checkout. Title to the piece passes to you only upon full payment (retention of title).",
        ],
      },
      {
        heading: "6. Returns and Refunds",
        body: [
          `You may return a purchased piece within 14 days of receipt, provided it is unworn, undamaged and in its original condition. Please write to us first at ${RETURN_EMAIL}. The return must be sent using a tracked shipping service at your own expense, to: Atelier by Arora, c/o Sheena Arora, Seestrasse 95, 8702 Zollikon, Switzerland.`,
          "Once the piece reaches us unworn and undamaged, we will refund the purchase price within 5 business days. Worn jewellery, or pieces damaged by the customer, are excluded from return and refund.",
          `If a piece arrives damaged, we will replace or fully refund it. Transit damage must, however, be thoroughly documented and proven (e.g. photographs taken immediately on receipt). Please report any such damage to ${RETURN_EMAIL} within 48 hours of delivery.`,
        ],
      },
      {
        heading: "7. Warranty",
        body: [
          "The statutory warranty provisions under the Swiss Code of Obligations apply. As our pieces are made by hand, small variations in the colour, shape and grain of stones and pearls are natural and do not constitute a defect.",
        ],
      },
      {
        heading: "8. Data Protection",
        body: [
          "We process your personal data (name, delivery and billing address, email address, phone number and order details) solely to fulfil your order and in accordance with applicable data protection law.",
          "Payment is handled by our payment provider Stripe. Your full card details are processed exclusively by Stripe and are never visible to us at any time.",
          "We do not share your data with unauthorised third parties and retain it only for as long as necessary to fulfil the contract and meet statutory retention obligations.",
        ],
      },
      {
        heading: "9. Governing Law and Jurisdiction",
        body: [
          "Swiss law applies exclusively. The place of jurisdiction is Zurich, Switzerland, to the extent permitted by law.",
        ],
      },
    ],
  },
};

export default function Policy() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "de";
  const content = CONTENT[lang];

  return (
    <div className="page-enter pt-20">
      <section className="bg-[#2D2620] py-20">
        <div className="container text-center">
          <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            Kalakosh Zürich
          </p>
          <h1 className="font-serif text-white">{content.title}</h1>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container max-w-3xl">
          <p className="text-xs text-muted-foreground font-sans uppercase tracking-[0.15em] mb-6">
            {content.updated}
          </p>
          <p className="text-muted-foreground font-sans leading-relaxed mb-10">{content.intro}</p>

          <div className="space-y-10">
            {content.sections.map((section) => (
              <div key={section.heading}>
                <h2 className="font-serif text-foreground text-xl mb-3">{section.heading}</h2>
                <div className="space-y-3">
                  {section.body.map((para, i) => (
                    <p
                      key={i}
                      className="text-muted-foreground text-sm font-sans leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: para.replace(
                          RETURN_EMAIL,
                          `<a href="mailto:${RETURN_EMAIL}" class="text-[#2D2620] underline hover:text-[#B8963E]">${RETURN_EMAIL}</a>`
                        ),
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
