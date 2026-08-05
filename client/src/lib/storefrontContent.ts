/**
 * Generic, tenant-branded storefront content.
 *
 * Zolto is multi-tenant: a store's public pages (home hero, about, FAQ, terms,
 * imprint) must not hardcode any one merchant's prose. These pure builders take
 * the current tenant's Branding and return neutral, commerce-generic copy
 * parameterized by store name, currency, and contact channels — so every tenant
 * gets a coherent storefront out of the box, with no jewelry/Kalakosh specifics.
 *
 * Every builder is language-aware: pass one of the four storefront languages
 * (de/en/fr/it) and the copy comes back fully translated (German uses formal
 * "Sie" with Swiss orthography, French "vous", Italian "Lei"). All translations
 * live in the per-language CONTENT record below — one entry per language, so a
 * new string is added in all four places at once rather than via if-chains.
 *
 * This is template copy, not a CMS. Merchant-authored content (custom about text,
 * their own legal terms) is a later enhancement; these builders are the sensible
 * default until then.
 */
import type { Branding } from "./branding";
import type { SupportedLanguage } from "./languages";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ContentSection {
  heading: string;
  body: string[];
}

function currencyLabel(currency: string): string {
  return (currency || "chf").toUpperCase();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Per-language content. Plain strings where no interpolation is needed,
 * template functions where branding values (store name, currency, email)
 * are woven into the sentence — word order differs per language, so the
 * templates own the sentence, not the caller.
 * ──────────────────────────────────────────────────────────────────────────── */

interface LangContent {
  hero: {
    badge: string;
    subtitle: string;
  };
  valueProps: { title: string; desc: string }[];
  faq: {
    payment: FaqItem;
    shipping: FaqItem;
    returns: FaqItem;
    pricesQuestion: string;
    pricesAnswer: (cur: string) => string;
    contactQuestion: (store: string) => string;
    contactEmailBit: (email: string) => string;
    contactViaChannels: (channels: string) => string;
    contactViaForm: string;
  };
  about: {
    title: (store: string) => string;
    paragraphs: (store: string) => string[];
  };
  terms: {
    prices: { heading: string; body: (cur: string) => string };
    orders: ContentSectionSource;
    delivery: ContentSectionSource;
    returns: ContentSectionSource;
    contact: {
      heading: string;
      withEmail: (store: string, email: string) => string;
      withoutEmail: (store: string) => string;
    };
  };
  imprint: {
    title: string;
    operatedBy: (store: string) => string;
    emailLine: (email: string) => string;
    responsibility: string;
  };
  chrome: {
    home: {
      exploreShop: string;
      scroll: string;
      shopByCategory: string;
      latestArrivals: string;
      newInShop: string;
      viewAll: string;
    };
    about: {
      browseShop: string;
      getInTouch: string;
    };
    faq: {
      eyebrow: string;
      title: string;
      subtitle: (store: string) => string;
      stillQuestions: string;
      reachOut: string;
      contactForm: string;
    };
    terms: {
      title: string;
      intro: (store: string) => string;
      disclaimer: (store: string) => string;
    };
    imprint: {
      disclaimer: (store: string) => string;
    };
  };
}

interface ContentSectionSource {
  heading: string;
  body: string;
}

const CONTENT: Record<SupportedLanguage, LangContent> = {
  /* ── English ─────────────────────────────────────────────────────────── */
  en: {
    hero: {
      badge: "Welcome",
      subtitle:
        "Browse the collection and check out securely online, or find us in person.",
    },
    valueProps: [
      { title: "Curated", desc: "Hand-picked pieces" },
      { title: "Secure checkout", desc: "Encrypted payments" },
      { title: "In person too", desc: "Buy online or at the counter" },
    ],
    faq: {
      payment: {
        question: "What payment methods do you accept?",
        answer:
          "We accept major credit and debit cards through our secure payment provider. In person, we also accept card and contactless payments.",
      },
      shipping: {
        question: "How much is shipping and how long does it take?",
        answer:
          "Shipping options and costs are shown at checkout based on your delivery address. You'll see the exact cost and estimated delivery time before you pay.",
      },
      returns: {
        question: "What is your return policy?",
        answer:
          "If something isn't right, contact us and we'll help. See our Terms for the full returns and refunds policy.",
      },
      pricesQuestion: "Prices — what currency are they in?",
      pricesAnswer: (cur) =>
        `All prices are shown in ${cur}. Any applicable taxes are shown at checkout.`,
      contactQuestion: (store) => `How do I get in touch with ${store}?`,
      contactEmailBit: (email) => `email (${email})`,
      contactViaChannels: (channels) =>
        `You can reach us via ${channels}, or the contact form.`,
      contactViaForm: `You can reach us through the contact form.`,
    },
    about: {
      title: (store) => `About ${store}`,
      paragraphs: (store) => [
        `${store} sells online and in person. Everything in the shop is available to browse and buy securely, with the same stock kept in sync across the counter and the website.`,
        `Have a question about a product or an order? Get in touch — we're happy to help.`,
      ],
    },
    terms: {
      prices: {
        heading: "1. Prices",
        body: (cur) =>
          `All prices are shown in ${cur}. Applicable taxes and shipping are shown before you complete your order.`,
      },
      orders: {
        heading: "2. Orders and payment",
        body: "Placing an order is an offer to purchase. Payment is processed securely by our payment provider; your full card details are never stored on our servers.",
      },
      delivery: {
        heading: "3. Delivery",
        body: "Delivery options, costs, and estimated times are shown at checkout. Title passes to you on full payment.",
      },
      returns: {
        heading: "4. Returns and refunds",
        body: "Unless required otherwise by law, returns are accepted for unused items in original condition within a reasonable period of receipt. Contact us before returning an item.",
      },
      contact: {
        heading: "5. Contact",
        withEmail: (store, email) =>
          `Questions about these terms? Contact ${store} at ${email}.`,
        withoutEmail: (store) =>
          `Questions about these terms? Contact ${store} through the contact form.`,
      },
    },
    imprint: {
      title: "Legal Notice",
      operatedBy: (store) => `Operated by ${store}.`,
      emailLine: (email) => `Email: ${email}`,
      responsibility:
        "This store is responsible for its own listings, fulfilment, and customer service.",
    },
    chrome: {
      home: {
        exploreShop: "Explore the shop",
        scroll: "Scroll",
        shopByCategory: "Shop by category",
        latestArrivals: "Latest arrivals",
        newInShop: "New in the shop",
        viewAll: "View all",
      },
      about: {
        browseShop: "Browse the shop",
        getInTouch: "Get in touch",
      },
      faq: {
        eyebrow: "Frequently Asked Questions",
        title: "How can we help?",
        subtitle: (store) =>
          `Answers about payment, shipping, returns, and getting in touch with ${store}.`,
        stillQuestions: "Still have questions?",
        reachOut: "Reach out — we usually reply within a day.",
        contactForm: "Contact Form",
      },
      terms: {
        title: "Terms & Conditions",
        intro: (store) =>
          `These terms govern purchases from ${store}. By placing an order you agree to them.`,
        disclaimer: (store) =>
          `This is a general template. ${store} is responsible for ensuring its terms comply with the laws that apply to its business and customers.`,
      },
      imprint: {
        disclaimer: (store) =>
          `${store} is responsible for adding any legal details its jurisdiction requires (company form, registration or VAT numbers, and a registered address).`,
      },
    },
  },

  /* ── German (formal Sie, Swiss orthography) ──────────────────────────── */
  de: {
    hero: {
      badge: "Willkommen",
      subtitle:
        "Stöbern Sie durch das Sortiment und bezahlen Sie sicher online — oder besuchen Sie uns vor Ort.",
    },
    valueProps: [
      { title: "Ausgewählt", desc: "Sorgfältig ausgewählte Stücke" },
      { title: "Sicherer Checkout", desc: "Verschlüsselte Zahlungen" },
      { title: "Auch vor Ort", desc: "Online oder an der Theke kaufen" },
    ],
    faq: {
      payment: {
        question: "Welche Zahlungsmethoden akzeptieren Sie?",
        answer:
          "Wir akzeptieren gängige Kredit- und Debitkarten über unseren sicheren Zahlungsanbieter. Vor Ort akzeptieren wir zudem Karten- und kontaktlose Zahlungen.",
      },
      shipping: {
        question:
          "Wie hoch sind die Versandkosten und wie lange dauert die Lieferung?",
        answer:
          "Versandoptionen und -kosten werden an der Kasse anhand Ihrer Lieferadresse angezeigt. Sie sehen die genauen Kosten und die voraussichtliche Lieferzeit, bevor Sie bezahlen.",
      },
      returns: {
        question: "Wie lauten Ihre Rückgabebedingungen?",
        answer:
          "Wenn etwas nicht passt, kontaktieren Sie uns — wir helfen gerne. Die vollständigen Rückgabe- und Erstattungsbedingungen finden Sie in unseren AGB.",
      },
      pricesQuestion: "Preise — in welcher Währung sind sie angegeben?",
      pricesAnswer: (cur) =>
        `Alle Preise sind in ${cur} angegeben. Allfällige Steuern werden an der Kasse ausgewiesen.`,
      contactQuestion: (store) => `Wie erreiche ich ${store}?`,
      contactEmailBit: (email) => `E-Mail (${email})`,
      contactViaChannels: (channels) =>
        `Sie erreichen uns über ${channels} oder über das Kontaktformular.`,
      contactViaForm: `Sie erreichen uns über das Kontaktformular.`,
    },
    about: {
      title: (store) => `Über ${store}`,
      paragraphs: (store) => [
        `${store} verkauft online und vor Ort. Das gesamte Sortiment lässt sich sicher durchstöbern und kaufen — der Lagerbestand ist zwischen Ladentheke und Website stets synchron.`,
        `Haben Sie eine Frage zu einem Produkt oder einer Bestellung? Melden Sie sich — wir helfen Ihnen gerne weiter.`,
      ],
    },
    terms: {
      prices: {
        heading: "1. Preise",
        body: (cur) =>
          `Alle Preise sind in ${cur} angegeben. Allfällige Steuern und Versandkosten werden angezeigt, bevor Sie Ihre Bestellung abschliessen.`,
      },
      orders: {
        heading: "2. Bestellung und Zahlung",
        body: "Mit einer Bestellung geben Sie ein Kaufangebot ab. Die Zahlung wird sicher über unseren Zahlungsanbieter abgewickelt; Ihre vollständigen Kartendaten werden nie auf unseren Servern gespeichert.",
      },
      delivery: {
        heading: "3. Lieferung",
        body: "Lieferoptionen, Kosten und voraussichtliche Lieferzeiten werden an der Kasse angezeigt. Das Eigentum geht mit vollständiger Bezahlung auf Sie über.",
      },
      returns: {
        heading: "4. Rückgabe und Erstattung",
        body: "Sofern gesetzlich nichts anderes vorgeschrieben ist, nehmen wir unbenutzte Artikel im Originalzustand innerhalb einer angemessenen Frist nach Erhalt zurück. Kontaktieren Sie uns, bevor Sie einen Artikel zurücksenden.",
      },
      contact: {
        heading: "5. Kontakt",
        withEmail: (store, email) =>
          `Fragen zu diesen Bedingungen? Kontaktieren Sie ${store} unter ${email}.`,
        withoutEmail: (store) =>
          `Fragen zu diesen Bedingungen? Kontaktieren Sie ${store} über das Kontaktformular.`,
      },
    },
    imprint: {
      title: "Impressum",
      operatedBy: (store) => `Betrieben von ${store}.`,
      emailLine: (email) => `E-Mail: ${email}`,
      responsibility:
        "Dieser Shop ist selbst für seine Angebote, den Versand und den Kundendienst verantwortlich.",
    },
    chrome: {
      home: {
        exploreShop: "Zum Shop",
        scroll: "Scrollen",
        shopByCategory: "Nach Kategorie",
        latestArrivals: "Neu eingetroffen",
        newInShop: "Neu im Shop",
        viewAll: "Alle ansehen",
      },
      about: {
        browseShop: "Shop entdecken",
        getInTouch: "Kontakt aufnehmen",
      },
      faq: {
        eyebrow: "Häufig gestellte Fragen",
        title: "Wie können wir Ihnen helfen?",
        subtitle: (store) =>
          `Antworten zu Zahlung, Versand, Rückgabe und Kontakt mit ${store}.`,
        stillQuestions: "Noch Fragen?",
        reachOut:
          "Melden Sie sich — wir antworten in der Regel innerhalb eines Tages.",
        contactForm: "Kontaktformular",
      },
      terms: {
        title: "Allgemeine Geschäftsbedingungen",
        intro: (store) =>
          `Diese Bedingungen gelten für Einkäufe bei ${store}. Mit Ihrer Bestellung erklären Sie sich damit einverstanden.`,
        disclaimer: (store) =>
          `Dies ist eine allgemeine Vorlage. ${store} ist dafür verantwortlich, dass die eigenen Bedingungen den für das Geschäft und die Kundschaft geltenden Gesetzen entsprechen.`,
      },
      imprint: {
        disclaimer: (store) =>
          `${store} ist dafür verantwortlich, alle rechtlich erforderlichen Angaben zu ergänzen (Rechtsform, Handelsregister- oder MWST-Nummer sowie eine Geschäftsadresse).`,
      },
    },
  },

  /* ── French (vous) ───────────────────────────────────────────────────── */
  fr: {
    hero: {
      badge: "Bienvenue",
      subtitle:
        "Parcourez la collection et payez en toute sécurité en ligne, ou retrouvez-nous sur place.",
    },
    valueProps: [
      { title: "Sélection soignée", desc: "Des pièces choisies avec soin" },
      { title: "Paiement sécurisé", desc: "Paiements chiffrés" },
      { title: "Aussi sur place", desc: "Achetez en ligne ou au comptoir" },
    ],
    faq: {
      payment: {
        question: "Quels moyens de paiement acceptez-vous ?",
        answer:
          "Nous acceptons les principales cartes de crédit et de débit via notre prestataire de paiement sécurisé. Sur place, nous acceptons également les paiements par carte et sans contact.",
      },
      shipping: {
        question: "Quels sont les frais et délais de livraison ?",
        answer:
          "Les options et frais de livraison sont affichés au moment du paiement en fonction de votre adresse de livraison. Vous verrez le coût exact et le délai estimé avant de payer.",
      },
      returns: {
        question: "Quelle est votre politique de retour ?",
        answer:
          "Si quelque chose ne convient pas, contactez-nous et nous vous aiderons. Consultez nos Conditions générales pour la politique complète de retours et de remboursements.",
      },
      pricesQuestion: "Les prix — dans quelle devise sont-ils affichés ?",
      pricesAnswer: (cur) =>
        `Tous les prix sont affichés en ${cur}. Les taxes applicables sont indiquées au moment du paiement.`,
      contactQuestion: (store) => `Comment contacter ${store} ?`,
      contactEmailBit: (email) => `e-mail (${email})`,
      contactViaChannels: (channels) =>
        `Vous pouvez nous joindre via ${channels}, ou via le formulaire de contact.`,
      contactViaForm: `Vous pouvez nous joindre via le formulaire de contact.`,
    },
    about: {
      title: (store) => `À propos de ${store}`,
      paragraphs: (store) => [
        `${store} vend en ligne et sur place. Toute la boutique peut être parcourue et achetée en toute sécurité, avec un stock synchronisé entre le comptoir et le site web.`,
        `Une question sur un produit ou une commande ? Contactez-nous, nous serons ravis de vous aider.`,
      ],
    },
    terms: {
      prices: {
        heading: "1. Prix",
        body: (cur) =>
          `Tous les prix sont affichés en ${cur}. Les taxes et frais de livraison applicables sont indiqués avant la validation de votre commande.`,
      },
      orders: {
        heading: "2. Commandes et paiement",
        body: "Passer une commande constitue une offre d'achat. Le paiement est traité de manière sécurisée par notre prestataire de paiement ; vos données de carte complètes ne sont jamais stockées sur nos serveurs.",
      },
      delivery: {
        heading: "3. Livraison",
        body: "Les options, frais et délais estimés de livraison sont affichés au moment du paiement. Le transfert de propriété a lieu au paiement intégral.",
      },
      returns: {
        heading: "4. Retours et remboursements",
        body: "Sauf disposition légale contraire, les retours sont acceptés pour les articles non utilisés, dans leur état d'origine, dans un délai raisonnable après réception. Contactez-nous avant de retourner un article.",
      },
      contact: {
        heading: "5. Contact",
        withEmail: (store, email) =>
          `Des questions sur ces conditions ? Contactez ${store} à l'adresse ${email}.`,
        withoutEmail: (store) =>
          `Des questions sur ces conditions ? Contactez ${store} via le formulaire de contact.`,
      },
    },
    imprint: {
      title: "Mentions légales",
      operatedBy: (store) => `Exploité par ${store}.`,
      emailLine: (email) => `E-mail : ${email}`,
      responsibility:
        "Cette boutique est responsable de ses propres annonces, de l'expédition et du service client.",
    },
    chrome: {
      home: {
        exploreShop: "Découvrir la boutique",
        scroll: "Défiler",
        shopByCategory: "Par catégorie",
        latestArrivals: "Nouveautés",
        newInShop: "Nouveau dans la boutique",
        viewAll: "Tout voir",
      },
      about: {
        browseShop: "Parcourir la boutique",
        getInTouch: "Nous contacter",
      },
      faq: {
        eyebrow: "Questions fréquentes",
        title: "Comment pouvons-nous vous aider ?",
        subtitle: (store) =>
          `Des réponses sur le paiement, la livraison, les retours et la prise de contact avec ${store}.`,
        stillQuestions: "Encore des questions ?",
        reachOut: "Écrivez-nous — nous répondons généralement sous un jour.",
        contactForm: "Formulaire de contact",
      },
      terms: {
        title: "Conditions générales",
        intro: (store) =>
          `Ces conditions régissent les achats auprès de ${store}. En passant commande, vous les acceptez.`,
        disclaimer: (store) =>
          `Ceci est un modèle général. ${store} est responsable de la conformité de ses conditions aux lois applicables à son activité et à sa clientèle.`,
      },
      imprint: {
        disclaimer: (store) =>
          `${store} est responsable d'ajouter les mentions légales requises dans sa juridiction (forme juridique, numéro de registre ou de TVA et adresse du siège).`,
      },
    },
  },

  /* ── Italian (Lei) ───────────────────────────────────────────────────── */
  it: {
    hero: {
      badge: "Benvenuti",
      subtitle:
        "Sfogli la collezione e concluda l'acquisto in sicurezza online, oppure venga a trovarci di persona.",
    },
    valueProps: [
      { title: "Selezione curata", desc: "Pezzi scelti con cura" },
      { title: "Pagamento sicuro", desc: "Pagamenti crittografati" },
      { title: "Anche di persona", desc: "Acquisti online o in negozio" },
    ],
    faq: {
      payment: {
        question: "Quali metodi di pagamento accettate?",
        answer:
          "Accettiamo le principali carte di credito e di debito tramite il nostro fornitore di pagamenti sicuro. Di persona accettiamo anche pagamenti con carta e contactless.",
      },
      shipping: {
        question: "Quanto costa la spedizione e quanto tempo richiede?",
        answer:
          "Le opzioni e i costi di spedizione vengono mostrati al momento del pagamento in base al Suo indirizzo di consegna. Vedrà il costo esatto e i tempi di consegna stimati prima di pagare.",
      },
      returns: {
        question: "Qual è la vostra politica di reso?",
        answer:
          "Se qualcosa non va, ci contatti e La aiuteremo. Consulti le nostre Condizioni generali per la politica completa su resi e rimborsi.",
      },
      pricesQuestion: "Prezzi — in quale valuta sono indicati?",
      pricesAnswer: (cur) =>
        `Tutti i prezzi sono indicati in ${cur}. Le eventuali imposte vengono mostrate al momento del pagamento.`,
      contactQuestion: (store) => `Come posso contattare ${store}?`,
      contactEmailBit: (email) => `e-mail (${email})`,
      contactViaChannels: (channels) =>
        `Può raggiungerci via ${channels} o tramite il modulo di contatto.`,
      contactViaForm: `Può raggiungerci tramite il modulo di contatto.`,
    },
    about: {
      title: (store) => `Informazioni su ${store}`,
      paragraphs: (store) => [
        `${store} vende online e di persona. L'intero assortimento può essere sfogliato e acquistato in sicurezza, con lo stesso stock sincronizzato tra il banco e il sito web.`,
        `Ha una domanda su un prodotto o un ordine? Ci contatti: saremo lieti di aiutarLa.`,
      ],
    },
    terms: {
      prices: {
        heading: "1. Prezzi",
        body: (cur) =>
          `Tutti i prezzi sono indicati in ${cur}. Le imposte e le spese di spedizione applicabili vengono mostrate prima della conferma dell'ordine.`,
      },
      orders: {
        heading: "2. Ordini e pagamento",
        body: "L'invio di un ordine costituisce un'offerta di acquisto. Il pagamento viene elaborato in modo sicuro dal nostro fornitore di pagamenti; i dati completi della Sua carta non vengono mai memorizzati sui nostri server.",
      },
      delivery: {
        heading: "3. Consegna",
        body: "Le opzioni di consegna, i costi e i tempi stimati vengono mostrati al momento del pagamento. La proprietà passa a Lei con il pagamento integrale.",
      },
      returns: {
        heading: "4. Resi e rimborsi",
        body: "Salvo diverso obbligo di legge, i resi sono accettati per articoli non utilizzati e in condizioni originali entro un periodo ragionevole dalla ricezione. Ci contatti prima di restituire un articolo.",
      },
      contact: {
        heading: "5. Contatto",
        withEmail: (store, email) =>
          `Domande su queste condizioni? Contatti ${store} all'indirizzo ${email}.`,
        withoutEmail: (store) =>
          `Domande su queste condizioni? Contatti ${store} tramite il modulo di contatto.`,
      },
    },
    imprint: {
      title: "Note legali",
      operatedBy: (store) => `Gestito da ${store}.`,
      emailLine: (email) => `E-mail: ${email}`,
      responsibility:
        "Questo negozio è responsabile delle proprie inserzioni, della spedizione e del servizio clienti.",
    },
    chrome: {
      home: {
        exploreShop: "Scopra lo shop",
        scroll: "Scorrere",
        shopByCategory: "Per categoria",
        latestArrivals: "Ultimi arrivi",
        newInShop: "Novità nello shop",
        viewAll: "Tutti gli articoli",
      },
      about: {
        browseShop: "Sfogli lo shop",
        getInTouch: "Ci contatti",
      },
      faq: {
        eyebrow: "Domande frequenti",
        title: "Come possiamo aiutarLa?",
        subtitle: (store) =>
          `Risposte su pagamento, spedizione, resi e come contattare ${store}.`,
        stillQuestions: "Ha ancora domande?",
        reachOut: "Ci scriva: di norma rispondiamo entro un giorno.",
        contactForm: "Modulo di contatto",
      },
      terms: {
        title: "Termini e condizioni",
        intro: (store) =>
          `Questi termini regolano gli acquisti presso ${store}. Effettuando un ordine, li accetta.`,
        disclaimer: (store) =>
          `Questo è un modello generale. ${store} è responsabile della conformità dei propri termini alle leggi applicabili alla sua attività e alla sua clientela.`,
      },
      imprint: {
        disclaimer: (store) =>
          `${store} è responsabile dell'aggiunta delle indicazioni legali richieste nella propria giurisdizione (forma giuridica, numero di registro o di IVA e sede legale).`,
      },
    },
  },
};

/* Icons are language-independent decoration; keep them out of the copy. */
const VALUE_PROP_ICONS = ["◈", "◇", "○"] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Generators
 * ──────────────────────────────────────────────────────────────────────────── */

/** Hero copy for the storefront home. */
export function heroCopy(
  branding: Branding,
  lang: SupportedLanguage = "en",
): {
  badge: string;
  title: string;
  subtitle: string;
} {
  const c = CONTENT[lang].hero;
  return {
    badge: c.badge,
    title: branding.storeName,
    subtitle: c.subtitle,
  };
}

/** Three neutral value props for the home page (replaces the founder story). */
export function valueProps(
  lang: SupportedLanguage = "en",
): { title: string; desc: string; icon: string }[] {
  return CONTENT[lang].valueProps.map((p, i) => ({
    ...p,
    icon: VALUE_PROP_ICONS[i],
  }));
}

/** Generic commerce FAQ, parameterized by the tenant's details. */
export function genericFaq(
  branding: Branding,
  lang: SupportedLanguage = "en",
): FaqItem[] {
  const c = CONTENT[lang].faq;
  const items: FaqItem[] = [
    c.payment,
    c.shipping,
    c.returns,
    {
      question: c.pricesQuestion,
      answer: c.pricesAnswer(currencyLabel(branding.currency)),
    },
  ];

  const contactBits: string[] = [];
  if (branding.whatsappNumber) contactBits.push("WhatsApp");
  if (branding.instagramHandle)
    contactBits.push(`Instagram (@${branding.instagramHandle})`);
  if (branding.contactEmail)
    contactBits.push(c.contactEmailBit(branding.contactEmail));
  const how =
    contactBits.length > 0
      ? c.contactViaChannels(contactBits.join(", "))
      : c.contactViaForm;
  items.push({
    question: c.contactQuestion(branding.storeName),
    answer: how,
  });

  return items;
}

/** Generic "About {store}" content. */
export function genericAbout(
  branding: Branding,
  lang: SupportedLanguage = "en",
): {
  title: string;
  paragraphs: string[];
} {
  const c = CONTENT[lang].about;
  return {
    title: c.title(branding.storeName),
    paragraphs: c.paragraphs(branding.storeName),
  };
}

/** Generic Terms of Service sections for a storefront (merchant should review). */
export function genericTermsSections(
  branding: Branding,
  lang: SupportedLanguage = "en",
): ContentSection[] {
  const c = CONTENT[lang].terms;
  const cur = currencyLabel(branding.currency);
  return [
    { heading: c.prices.heading, body: [c.prices.body(cur)] },
    { heading: c.orders.heading, body: [c.orders.body] },
    { heading: c.delivery.heading, body: [c.delivery.body] },
    { heading: c.returns.heading, body: [c.returns.body] },
    {
      heading: c.contact.heading,
      body: [
        branding.contactEmail
          ? c.contact.withEmail(branding.storeName, branding.contactEmail)
          : c.contact.withoutEmail(branding.storeName),
      ],
    },
  ];
}

/** Generic imprint / legal-notice fields. */
export function genericImprint(
  branding: Branding,
  lang: SupportedLanguage = "en",
): {
  title: string;
  lines: string[];
} {
  const c = CONTENT[lang].imprint;
  const lines = [c.operatedBy(branding.storeName)];
  if (branding.contactEmail) lines.push(c.emailLine(branding.contactEmail));
  lines.push(c.responsibility);
  return { title: c.title, lines };
}

/**
 * Page-chrome strings for the storefront pages that render the generators:
 * headings, eyebrows, CTAs and disclaimer notes that live in the page markup
 * rather than in the generated content itself. Kept here (not in the i18next
 * locale files) so all template storefront copy has a single home.
 */
export function pageChrome(branding: Branding, lang: SupportedLanguage = "en") {
  const c = CONTENT[lang].chrome;
  const store = branding.storeName;
  return {
    home: c.home,
    about: c.about,
    faq: {
      eyebrow: c.faq.eyebrow,
      title: c.faq.title,
      subtitle: c.faq.subtitle(store),
      stillQuestions: c.faq.stillQuestions,
      reachOut: c.faq.reachOut,
      contactForm: c.faq.contactForm,
    },
    terms: {
      title: c.terms.title,
      intro: c.terms.intro(store),
      disclaimer: c.terms.disclaimer(store),
    },
    imprint: {
      disclaimer: c.imprint.disclaimer(store),
    },
  };
}
