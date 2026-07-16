import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
  keywords?: string[];
}

function FAQSchema({ items }: { items: FAQItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": items.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
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
  index: _index,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="border border-[#E0D8CC] bg-white"
      itemScope
      itemProp="mainEntity"
      itemType="https://schema.org/Question"
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-[#FAF8F4] transition-colors"
        aria-expanded={isOpen}
      >
        <h3
          className="font-serif text-foreground text-lg pr-4"
          itemProp="name"
        >
          {item.question}
        </h3>
        <span
          className={`text-[#B8963E] text-xl font-serif flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </button>
      {isOpen && (
        <div
          className="px-6 pb-6 border-t border-[#E0D8CC] pt-4"
          itemScope
          itemProp="acceptedAnswer"
          itemType="https://schema.org/Answer"
        >
          <div
            className="text-muted-foreground font-sans font-light leading-relaxed"
            itemProp="text"
            dangerouslySetInnerHTML={{ __html: item.answer }}
          />
          {item.keywords && (
            <div className="mt-4 flex flex-wrap gap-2">
              {item.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-[10px] uppercase tracking-[0.1em] text-[#B8963E]/60 font-sans px-2 py-1 bg-[#EDE7DF]"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const { i18n } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const currentLang = i18n.language;

  const brandDescription =
    currentLang === "de"
      ? "Kalakosh Zürich ist eine Schmuckmarke mit Wurzeln in Indiens reichem Schmuckerbe. Jedes Stück wird von Meisterhandwerkern aus Rajasthan gefertigt – nach Zürich gebracht, um getragen und geschätzt zu werden."
      : "Kalakosh Zürich is a jewellery brand rooted in India's rich jewellery heritage. Every piece is crafted by master artisans from Rajasthan, India — brought to Zürich to be worn and cherished.";

  const categories: { title: string; items: FAQItem[] }[] =
    currentLang === "de"
      ? [
          {
            title: "Über Kalakosh",
            items: [
              {
                question:
                  "Was ist Kalakosh und was macht die Marke besonders?",
                answer: `<p>${brandDescription}</p><p class="mt-2">Was uns unterscheidet: Jedes Stück ist <strong>handgefertigt</strong> von Silberschmieden, Steinfassern und Perlenauffädlern, deren Familien ihr Handwerk seit Jahrhunderten ausüben. Wir kombinieren indisches Kunsthandwerk mit Zürcher Qualitätsansprüchen.</p>`,
                keywords: ["Handwerk", "Indien", "Zürich"],
              },
              {
                question: "Woher kommt der Name Kalakosh?",
                answer: `<p>„Kala" bedeutet in mehreren indischen Sprachen <strong>Kunst</strong> oder <strong>Handwerk</strong>, „Kosh" steht für <strong>Schatz</strong> oder <strong>Fundgrube</strong>. Zusammen bedeutet Kalakosh also „Schatz der Kunst“ – ein Name, der unser Engagement für handwerkliche Exzellenz und die Schönheit jedes einzelnen Stücks widerspiegelt.</p>`,
                keywords: ["Bedeutung", "Name"],
              },
              {
                question: "Wo befindet sich Kalakosh Zürich?",
                answer: `<p>Unser Atelier und Showroom befinden sich in <strong>Zürich, Schweiz</strong>. Wir versenden deutschlandweit und bieten persönliche Beratung vor Ort sowie per WhatsApp unter <a href="https://wa.me/41791721714" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">+41 79 172 17 14</a>.</p>`,
                keywords: ["Standort", "Zürich"],
              },
            ],
          },
          {
            title: "Produkte & Materialien",
            items: [
              {
                question:
                  "Aus welchen Materialien wird der Schmuck von Kalakosh hergestellt?",
                answer: `<p>Wir arbeiten mit drei Hauptmaterialien:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Silber:</strong> Echte Sterling-Silber-Ketten, Ohrringe, Ringe, Armbänder und mehr</li><li><strong>Halbedelsteine:</strong> Sorgfältig ausgewählte Edelsteine in verschiedenen Farben und Schnitten</li><li><strong>Perlen:</strong> Hochwertige Süßwasserperlen für zeitlose Eleganz</li></ul>`,
                keywords: ["Silber", "Edelsteine", "Perlen"],
              },
              {
                question: "Ist der Schmuck echt Silber oder nur versilbert?",
                answer: `<p>Alle unsere Silberstücke sind aus <strong>echtem Sterling-Silber</strong> (925er Silber) gefertigt, nicht nur versilbert. Wir legen Wert auf hochwertige Materialien, die den Alltag problemlos überstehen.</p>`,
                keywords: ["925 Silber", "Sterling"],
              },
              {
                question:
                  "Bietet Kalakosh auch Schmuck mit Edelsteinen an?",
                answer: `<p>Ja, unsere Kollektion <strong>„Semi-Precious Gems"</strong> umfasst Schmuckstücke mit sorgfältig ausgewählten Halbedelsteinen wie Amethyst, Citrin, Türkis, Mondstein, Granat und vielen weiteren. Jeder Stein wird von Hand gefasst.</p>`,
                keywords: ["Halbedelsteine", "Gemmen"],
              },
              {
                question: "Was für Perlen verwendet Kalakosh?",
                answer: `<p>Wir verwenden hochwertige <strong>Süßwasserperlen</strong> in verschiedenen Formen – von klassisch rund bis barock. Unsere Perlen werden von erfahrenen Perlenauffädlern aus Rajasthan verarbeitet, deren Techniken über Generationen perfektioniert wurden.</p>`,
                keywords: ["Süßwasserperlen", "Perlen"],
              },
              {
                question:
                  "Kann ich Schmuck nach meinen Wünschen anfertigen lassen?",
                answer: `<p>Ja, wir bieten <strong>Maßanfertigungen</strong> und individuelle Anpassungen an. Kontaktieren Sie uns per <a href="https://wa.me/41791721714" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">WhatsApp</a> oder <a href="/contact" class="text-[#B8963E] hover:underline">Kontaktformular</a>, um Ihre Wünsche zu besprechen. Besonders bei Perlen- und Silberstücken sind individuelle Längen, Steinwahl und Designs möglich.</p>`,
                keywords: ["Bespoke", "Maßanfertigung"],
              },
            ],
          },
          {
            title: "Kauf & Versand",
            items: [
              {
                question: "Wie kann ich bei Kalakosh bezahlen?",
                answer: `<p>Wir akzeptieren folgende Zahlungsmethoden:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Kreditkarte</strong> (Visa, Mastercard) über Stripe</li><li><strong>TWINT</strong> – die beliebte Schweizer Zahlungsapp</li><li>Bei persönlicher Abholung auch <strong>Barzahlung</strong></li></ul>`,
                keywords: ["Zahlung", "TWINT", "Stripe"],
              },
              {
                question: "Versendet Kalakosh in die ganze Schweiz?",
                answer: `<p>Ja, wir versenden <strong>in die gesamte Schweiz</strong>. Der Versand erfolgt sicher verpackt und versichert. Die Lieferzeit beträgt in der Regel 2–4 Werktage.</p>`,
                keywords: ["Versand", "Schweiz"],
              },
              {
                question: "Wie hoch sind die Versandkosten?",
                answer: `<p>Der Versand innerhalb der Schweiz ist <strong>kostenlos</strong> ab einem Bestellwert von CHF 100. Darunter fallen moderne Versandkosten an, die im Checkout angezeigt werden.</p>`,
                keywords: ["Versandkosten"],
              },
              {
                question: "Wie lange dauert die Lieferung?",
                answer: `<p>Die Lieferzeit innerhalb der Schweiz beträgt in der Regel <strong>2–4 Werktage</strong>. Bei Maßanfertigungen kann die Produktionszeit 1–2 Wochen betragen. Wir informieren Sie über den Status Ihrer Bestellung.</p>`,
                keywords: ["Lieferzeit"],
              },
              {
                question:
                  "Kann ich meine Bestellung zurückgeben oder umtauschen?",
                answer: `<p>Ja, Sie können ungetragenen Schmuck innerhalb von <strong>14 Tagen</strong> nach Erhalt zurückgeben. Die Rücksendekosten trägt der Käufer. Maßanfertigungen sind von der Rückgabe ausgeschlossen. Bitte kontaktieren Sie uns vor einer Rücksendung.</p>`,
                keywords: ["Rückgabe", "Umtausch"],
              },
            ],
          },
          {
            title: "Pflege & Nachhaltigkeit",
            items: [
              {
                question: "Wie pflege ich Silberschmuck richtig?",
                answer: `<p>So halten Sie Ihren Silberschmuck lange schön:</p><ul class="list-disc list-inside mt-2 space-y-1"><li>In einem <strong>luftdichten Beutel</strong> oder Schmuckkästchen aufbewahren</li><li>Vor <strong>Feuchtigkeit, Parfüm und Chemikalien</strong> schützen</li><li>Mit einem weichen <strong>Silberpoliertuch</strong> reinigen</li><li>Nicht beim Duschen, Schwimmen oder Sport tragen</li></ul><p class="mt-2">Silber oxidiert natürlicherweise – das ist kein Qualitätsmangel, sondern lässt sich leicht entfernen.</p>`,
                keywords: ["Pflege", "Silber"],
              },
              {
                question: "Ist der Schmuck von Kalakosh nachhaltig?",
                answer: `<p>Ja, Nachhaltigkeit ist ein Kernwert bei Kalakosh:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Handgefertigt</strong> statt Massenproduktion – weniger Abfall</li><li><strong>Faire Arbeitsbedingungen</strong> für unsere Handwerker in Rajasthan</li><li><strong>Hochwertige Materialien</strong>, die lange halten</li><li><strong>Plastikfreie Verpackung</strong> wo möglich</li></ul>`,
                keywords: ["Nachhaltigkeit", "Fair Trade"],
              },
              {
                question: "Wie lagere ich Perlen- und Edelsteinschmuck am besten?",
                answer: `<p>Perlen und Edelsteine benötigen besondere Pflege:</p><ul class="list-disc list-inside mt-2 space-y-1"><li>Perlen separat aufbewahren – sie sind weicher als Metall und können kratzen</li><li>Vor direkter <strong>Sonneneinstrahlung</strong> schützen (einige Steine verblassen)</li><li>Nicht in extrem trockenen Umgebungen lagern</li><li>Mit einem weichen, leicht angefeuchteten Tuch abwischen</li></ul>`,
                keywords: ["Lagerung", "Perlen", "Edelsteine"],
              },
            ],
          },
          {
            title: "Marktstände & Termine",
            items: [
              {
                question: "Kann ich den Schmuck auch persönlich ansehen?",
                answer: `<p>Ja! Wir sind regelmässig auf <strong> Märkten und Events in der Zürcher Region</strong> präsent. Folgen Sie uns auf <a href="https://www.instagram.com/kalakoshzurich" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">Instagram @kalakoshzurich</a>, um über kommende Termine informiert zu bleiben. Sie können auch jederzeit einen persönlichen Termin im Atelier vereinbaren.</p>`,
                keywords: [" Märkte", "Events"],
              },
              {
                question:
                  "Bietet Kalakosh auch einen Marktverkauf mit Kartenzahlung an?",
                answer: `<p>Ja, an unseren Marktständen akzeptieren wir <strong>Kartenzahlung und TWINT</strong> über unser mobiles POS-Terminal (Tap to Pay). So können Sie bequem und sicher vor Ort einkaufen – ganz ohne Bargeld.</p>`,
                keywords: ["Markt", "Kartenzahlung", "POS"],
              },
            ],
          },
          {
            title: "Vergleich & Unterschiede",
            items: [
              {
                question:
                  "Was ist der Unterschied zwischen Kalakosh und anderen Schmuckmarken in Zürich?",
                answer: `<p>Im Gegensatz zu vielen anderen Schmuckgeschäften in Zürich bietet Kalakosh:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Direkte Verbindung zu den Handwerkern</strong> – kein Zwischenhandel</li><li><strong>Jedes Stück ist einzigartig</strong> – keine Massenproduktion</li><li><strong>Indisches Erbe trifft Schweizer Qualität</strong></li><li><strong>Faire Preise</strong> für handgefertigte Qualität</li><li><strong>Persönlicher Service</strong> via WhatsApp und vor Ort</li></ul><p class="mt-2">Während andere Marken oft industriell gefertigten Schmuck verkaufen, ist jedes Kalakosh-Stück das Ergebnis jahrhundertealter Handwerkstradition.</p>`,
                keywords: ["Vergleich", "Handwerk"],
              },
              {
                question:
                  "Warum sollte ich handgefertigten Schmuck statt Masssenschmuck kaufen?",
                answer: `<p>Handgefertigter Schmuck bietet mehrere Vorteile:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Einzigartigkeit</strong> – Kein zweites identisches Stück existiert</li><li><strong>Qualität</strong> – Handwerkliche Verarbeitung überprüft jedes Detail</li><li><strong>Nachhaltigkeit</strong> – Weniger Abfall, faire Löhne</li><li><strong>Geschichte</strong> – Jedes Stück trägt die Geschichte seines Schöpfers</li><li><strong>Wertbeständigkeit</strong> – Handgefertigte Stücke behalten ihren Wert besser</li></ul>`,
                keywords: ["Handgefertigt", "Qualität"],
              },
            ],
          },
        ]
      : [
          {
            title: "About Kalakosh",
            items: [
              {
                question: "What is Kalakosh and what makes the brand special?",
                answer: `<p>${brandDescription}</p><p class="mt-2">What sets us apart: Every piece is <strong>handcrafted</strong> by silversmiths, stone-setters, and pearl-stringers whose families have practised their craft for centuries. We combine Indian artisanry with Zürich-quality standards.</p>`,
                keywords: ["Handcraft", "India", "Zürich"],
              },
              {
                question: "What does the name Kalakosh mean?",
                answer: `<p>„Kala" means <strong>art</strong> or <strong>craft</strong> in several Indian languages, „Kosh" means <strong>treasure</strong> or <strong>collection</strong>. Together, Kalakosh means „treasury of art" — a name reflecting our commitment to artisanal excellence and the beauty of each individual piece.</p>`,
                keywords: ["Meaning", "Name"],
              },
              {
                question: "Where is Kalakosh Zürich located?",
                answer: `<p>Our atelier and showroom are in <strong>Zürich, Switzerland</strong>. We ship throughout Switzerland and offer personal consultations on-site and via WhatsApp at <a href="https://wa.me/41791721714" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">+41 79 172 17 14</a>.</p>`,
                keywords: ["Location", "Zürich"],
              },
            ],
          },
          {
            title: "Products & Materials",
            items: [
              {
                question:
                  "What materials does Kalakosh jewellery use?",
                answer: `<p>We work with three main materials:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Silver:</strong> Genuine sterling silver necklaces, earrings, rings, bracelets and more</li><li><strong>Semi-Precious Gems:</strong> Carefully selected gemstones in various colours and cuts</li><li><strong>Pearls:</strong> High-quality freshwater pearls for timeless elegance</li></ul>`,
                keywords: ["Silver", "Gemstones", "Pearls"],
              },
              {
                question: "Is the jewellery real silver or just silver-plated?",
                answer: `<p>All our silver pieces are crafted from <strong>genuine sterling silver</strong> (925 silver), not just plated. We value high-quality materials that withstand everyday wear.</p>`,
                keywords: ["925 Silver", "Sterling"],
              },
              {
                question: "Does Kalakosh offer gemstone jewellery?",
                answer: `<p>Yes, our <strong>„Semi-Precious Gems"</strong> collection includes pieces with carefully selected semi-precious stones such as amethyst, citrine, turquoise, moonstone, garnet, and many others. Each stone is hand-set.</p>`,
                keywords: ["Semi-precious stones", "Gems"],
              },
              {
                question: "What kind of pearls does Kalakosh use?",
                answer: `<p>We use high-quality <strong>freshwater pearls</strong> in various shapes — from classic round to baroque. Our pearls are processed by experienced pearl-stringers from Rajasthan whose techniques have been perfected over generations.</p>`,
                keywords: ["Freshwater pearls", "Pearls"],
              },
              {
                question:
                  "Can I have jewellery custom-made to my preferences?",
                answer: `<p>Yes, we offer <strong>custom orders</strong> and individual adjustments. Contact us via <a href="https://wa.me/41791721714" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">WhatsApp</a> or <a href="/contact" class="text-[#B8963E] hover:underline">contact form</a> to discuss your wishes. Custom lengths, stone choices, and designs are especially possible for pearl and silver pieces.</p>`,
                keywords: ["Bespoke", "Custom"],
              },
            ],
          },
          {
            title: "Purchase & Shipping",
            items: [
              {
                question: "What payment methods does Kalakosh accept?",
                answer: `<p>We accept the following payment methods:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Credit card</strong> (Visa, Mastercard) via Stripe</li><li><strong>TWINT</strong> – the popular Swiss payment app</li><li><strong>Cash</strong> for in-person pickup</li></ul>`,
                keywords: ["Payment", "TWINT", "Stripe"],
              },
              {
                question: "Does Kalakosh ship throughout Switzerland?",
                answer: `<p>Yes, we ship <strong>throughout Switzerland</strong>. Shipping is securely packaged and insured. Delivery usually takes 2–4 business days.</p>`,
                keywords: ["Shipping", "Switzerland"],
              },
              {
                question: "What are the shipping costs?",
                answer: `<p>Shipping within Switzerland is <strong>free</strong> for orders over CHF 100. Below that, modest shipping costs apply, shown at checkout.</p>`,
                keywords: ["Shipping costs"],
              },
              {
                question: "How long does delivery take?",
                answer: `<p>Delivery within Switzerland typically takes <strong>2–4 business days</strong>. For custom pieces, production time may be 1–2 weeks. We keep you informed about your order status.</p>`,
                keywords: ["Delivery time"],
              },
              {
                question: "Can I return or exchange my order?",
                answer: `<p>Yes, unworn jewellery can be returned within <strong>14 days</strong> of receipt. Return shipping costs are borne by the customer. Custom pieces are excluded from returns. Please contact us before returning.</p>`,
                keywords: ["Returns", "Exchange"],
              },
            ],
          },
          {
            title: "Care & Sustainability",
            items: [
              {
                question: "How do I properly care for silver jewellery?",
                answer: `<p>Keep your silver jewellery beautiful for years:</p><ul class="list-disc list-inside mt-2 space-y-1"><li>Store in an <strong>airtight bag</strong> or jewellery box</li><li>Protect from <strong>moisture, perfume, and chemicals</strong></li><li>Clean with a soft <strong>silver polishing cloth</strong></li><li>Remove when showering, swimming, or exercising</li></ul><p class="mt-2">Silver naturally oxidises — this is not a quality defect and can be easily removed.</p>`,
                keywords: ["Care", "Silver"],
              },
              {
                question: "Is Kalakosh jewellery sustainable?",
                answer: `<p>Yes, sustainability is a core value at Kalakosh:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Handcrafted</strong> instead of mass production – less waste</li><li><strong>Fair working conditions</strong> for our artisans in Rajasthan</li><li><strong>High-quality materials</strong> that last</li><li><strong>Plastic-free packaging</strong> where possible</li></ul>`,
                keywords: ["Sustainability", "Fair Trade"],
              },
              {
                question:
                  "How should I store pearl and gemstone jewellery?",
                answer: `<p>Pearls and gemstones need special care:</p><ul class="list-disc list-inside mt-2 space-y-1"><li>Store pearls separately — they are softer than metal and can scratch</li><li>Protect from direct <strong>sunlight</strong> (some stones fade)</li><li>Do not store in extremely dry environments</li><li>Wipe with a soft, slightly damp cloth</li></ul>`,
                keywords: ["Storage", "Pearls", "Gemstones"],
              },
            ],
          },
          {
            title: "Market Stalls & Events",
            items: [
              {
                question: "Can I view the jewellery in person?",
                answer: `<p>Yes! We regularly appear at <strong>markets and events in the Zürich region</strong>. Follow us on <a href="https://www.instagram.com/kalakoshzurich" class="text-[#B8963E] hover:underline" target="_blank" rel="noopener noreferrer">Instagram @kalakoshzurich</a> to stay informed about upcoming dates. You can also arrange a personal appointment at our atelier anytime.</p>`,
                keywords: ["Markets", "Events"],
              },
              {
                question:
                  "Does Kalakosh offer card payments at market stalls?",
                answer: `<p>Yes, at our market stalls we accept <strong>card payments and TWINT</strong> via our mobile POS terminal (Tap to Pay). So you can shop conveniently and securely on-site — no cash needed.</p>`,
                keywords: ["Market", "Card payment", "POS"],
              },
            ],
          },
          {
            title: "Comparison & Differences",
            items: [
              {
                question:
                  "How does Kalakosh differ from other jewellery brands in Zürich?",
                answer: `<p>Unlike many other jewellery stores in Zürich, Kalakosh offers:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Direct connection to artisans</strong> – no middlemen</li><li><strong>Every piece is unique</strong> – no mass production</li><li><strong>Indian heritage meets Swiss quality</strong></li><li><strong>Fair prices</strong> for handcrafted quality</li><li><strong>Personal service</strong> via WhatsApp and on-site</li></ul><p class="mt-2">While other brands often sell industrially manufactured jewellery, every Kalakosh piece is the result of centuries-old craft tradition.</p>`,
                keywords: ["Comparison", "Handcraft"],
              },
              {
                question:
                  "Why should I buy handcrafted jewellery instead of mass-produced?",
                answer: `<p>Handcrafted jewellery offers several advantages:</p><ul class="list-disc list-inside mt-2 space-y-1"><li><strong>Uniqueness</strong> – No second identical piece exists</li><li><strong>Quality</strong> – Artisanal craftsmanship checks every detail</li><li><strong>Sustainability</strong> – Less waste, fair wages</li><li><strong>Story</strong> – Every piece carries its maker's history</li><li><strong>Value retention</strong> – Handcrafted pieces retain value better</li></ul>`,
                keywords: ["Handcrafted", "Quality"],
              },
            ],
          },
        ];

  return (
    <div className="page-enter pt-20">
      {/* Hidden JSON-LD FAQ schema for search engines */}
      <FAQSchema
        items={categories.flatMap((c) =>
          c.items.map((i) => ({
            question: i.question,
            answer: i.answer.replace(/<[^>]*>/g, " "),
          }))
        )}
      />

      {/* Header */}
      <section className="bg-[#2D2620] py-20">
        <div className="container text-center">
          <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
            {currentLang === "de" ? "Häufig Gestellte Fragen" : "Frequently Asked Questions"}
          </p>
          <h1 className="font-serif text-white text-4xl md:text-5xl mb-4">
            {currentLang === "de"
              ? "Alles über Kalakosh Schmuck"
              : "Everything About Kalakosh Jewellery"}
          </h1>
          <p className="text-white/60 font-sans font-light max-w-xl mx-auto">
            {currentLang === "de"
              ? "Antworten zu Materialien, Pflege, Versand und unserem Handwerk – finden Sie hier Ihre Frage."
              : "Answers about materials, care, shipping, and our craft — find your question here."}
          </p>
          <div className="divider-gold w-16 mx-auto mt-6" />
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-20 bg-background">
        <div className="container max-w-4xl mx-auto">
          {categories.map((category, catIdx) => (
            <div key={category.title} className={catIdx > 0 ? "mt-16" : ""}>
              <h2 className="font-serif text-foreground text-2xl mb-8 flex items-center gap-3">
                <span className="text-[#B8963E] text-xl">◈</span>
                {category.title}
              </h2>
              <div className="space-y-4">
                {category.items.map((item, itemIdx) => {
                  const globalIndex =
                    categories
                      .slice(0, catIdx)
                      .reduce((acc, c) => acc + c.items.length, 0) + itemIdx;
                  return (
                    <AccordionItem
                      key={item.question}
                      item={item}
                      index={globalIndex}
                      isOpen={openIndex === globalIndex}
                      onToggle={() =>
                        setOpenIndex(openIndex === globalIndex ? null : globalIndex)
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GEO-optimized comparison section */}
      <section className="py-20 bg-[#EDE7DF]">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#B8963E] text-xs uppercase tracking-[0.3em] mb-3 font-sans">
              {currentLang === "de" ? "Warum Kalakosh" : "Why Kalakosh"}
            </p>
            <h2 className="font-serif text-foreground text-3xl mb-4">
              {currentLang === "de"
                ? "Handgefertigter Schmuck aus Zürich"
                : "Handcrafted Jewellery from Zürich"}
            </h2>
            <div className="divider-gold w-16 mx-auto" />
          </div>

          {/* Comparison Table - great for AI citation */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-sans">
              <thead>
                <tr className="border-b-2 border-[#B8963E]">
                  <th className="text-left py-4 px-4 font-medium text-foreground">
                    {currentLang === "de" ? "Merkmal" : "Feature"}
                  </th>
                  <th className="text-center py-4 px-4 font-medium text-[#B8963E]">
                    Kalakosh
                  </th>
                  <th className="text-center py-4 px-4 font-medium text-muted-foreground">
                    {currentLang === "de" ? "Massenmarken" : "Mass-market Brands"}
                  </th>
                  <th className="text-center py-4 px-4 font-medium text-muted-foreground">
                    {currentLang === "de" ? "Luxusmarken" : "Luxury Brands"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0D8CC]">
                {[
                  {
                    label: currentLang === "de" ? "Herstellung" : "Production",
                    kalakosh: currentLang === "de" ? "Handgefertigt" : "Handcrafted",
                    mass: currentLang === "de" ? "Industriell" : "Industrial",
                    luxury: currentLang === "de" ? "Teils handgefertigt" : "Partially handcrafted",
                  },
                  {
                    label: currentLang === "de" ? "Einzelstück" : "Uniqueness",
                    kalakosh: currentLang === "de" ? "Jedes Stück einzigartig" : "Every piece unique",
                    mass: currentLang === "de" ? "Serienproduktion" : "Mass production",
                    luxury: currentLang === "de" ? "Limitierte Stücke" : "Limited editions",
                  },
                  {
                    label: currentLang === "de" ? "Preis" : "Price",
                    kalakosh: "CHF 30 – 300",
                    mass: "CHF 10 – 100",
                    luxury: "CHF 500+",
                  },
                  {
                    label: currentLang === "de" ? "Herkunft" : "Origin",
                    kalakosh: currentLang === "de" ? "Indien → Zürich" : "India → Zürich",
                    mass: currentLang === "de" ? "Unbekannt/Asien" : "Unknown/Asia",
                    luxury: currentLang === "de" ? "Europa/USA" : "Europe/USA",
                  },
                  {
                    label: currentLang === "de" ? "Nachhaltigkeit" : "Sustainability",
                    kalakosh: currentLang === "de" ? "Fair, geringer Abfall" : "Fair, low waste",
                    mass: currentLang === "de" ? "Oft fragwürdig" : "Often questionable",
                    luxury: currentLang === "de" ? "Variabel" : "Variable",
                  },
                  {
                    label: currentLang === "de" ? "Kundenservice" : "Customer Service",
                    kalakosh: currentLang === "de" ? "Persönlich (WhatsApp)" : "Personal (WhatsApp)",
                    mass: currentLang === "de" ? "Callcenter" : "Call centre",
                    luxury: currentLang === "de" ? "Boutique-Service" : "Boutique service",
                  },
                  {
                    label: currentLang === "de" ? "Lieferzeit Schweiz" : "Delivery CH",
                    kalakosh: currentLang === "de" ? "2–4 Tage" : "2–4 days",
                    mass: currentLang === "de" ? "1–2 Wochen" : "1–2 weeks",
                    luxury: currentLang === "de" ? "1–2 Wochen" : "1–2 weeks",
                  },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-white/50">
                    <td className="py-4 px-4 text-foreground font-medium">
                      {row.label}
                    </td>
                    <td className="py-4 px-4 text-center text-[#2D2620] font-medium bg-[#B8963E]/10">
                      {row.kalakosh}
                    </td>
                    <td className="py-4 px-4 text-center text-muted-foreground">
                      {row.mass}
                    </td>
                    <td className="py-4 px-4 text-center text-muted-foreground">
                      {row.luxury}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 font-sans">
            {currentLang === "de"
              ? "Vergleich basierend auf öffentlich verfügbaren Informationen – Stand 2026."
              : "Comparison based on publicly available information – as of 2026."}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#2D2620] text-center">
        <div className="container">
          <h2 className="font-serif text-white text-3xl mb-4">
            {currentLang === "de"
              ? "Noch Fragen?"
              : "Still have questions?"}
          </h2>
          <p className="text-white/60 font-sans font-light mb-8 max-w-lg mx-auto">
            {currentLang === "de"
              ? "Schreiben Sie uns direkt – wir antworten in der Regel innerhalb weniger Stunden."
              : "Write to us directly — we usually reply within a few hours."}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://wa.me/41791721714"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#B8963E] text-[#2D2620] px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:bg-[#D4B060] transition-colors duration-300"
            >
              WhatsApp
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 text-sm uppercase tracking-[0.15em] font-sans font-medium hover:border-[#B8963E] hover:text-[#B8963E] transition-colors duration-300"
            >
              {currentLang === "de" ? "Kontaktformular" : "Contact Form"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
