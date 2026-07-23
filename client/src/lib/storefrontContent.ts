/**
 * Generic, tenant-branded storefront content.
 *
 * Zolto is multi-tenant: a store's public pages (home hero, about, FAQ, terms,
 * imprint) must not hardcode any one merchant's prose. These pure builders take
 * the current tenant's Branding and return neutral, commerce-generic copy
 * parameterized by store name, currency, and contact channels — so every tenant
 * gets a coherent storefront out of the box, with no jewelry/Kalakosh specifics.
 *
 * This is template copy, not a CMS. Merchant-authored content (custom about text,
 * their own legal terms) is a later enhancement; these builders are the sensible
 * default until then.
 */
import type { Branding } from "./branding";

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

/** Hero copy for the storefront home. */
export function heroCopy(branding: Branding): {
  badge: string;
  title: string;
  subtitle: string;
} {
  return {
    badge: "Welcome",
    title: branding.storeName,
    subtitle:
      "Browse the collection and check out securely online, or find us in person.",
  };
}

/** Three neutral value props for the home page (replaces the founder story). */
export function valueProps(): { title: string; desc: string; icon: string }[] {
  return [
    { title: "Curated", desc: "Hand-picked pieces", icon: "◈" },
    { title: "Secure checkout", desc: "Encrypted payments", icon: "◇" },
    { title: "In person too", desc: "Buy online or at the counter", icon: "○" },
  ];
}

/** Generic commerce FAQ, parameterized by the tenant's details. */
export function genericFaq(branding: Branding): FaqItem[] {
  const items: FaqItem[] = [
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept major credit and debit cards through our secure payment provider. In person, we also accept card and contactless payments.",
    },
    {
      question: "How much is shipping and how long does it take?",
      answer:
        "Shipping options and costs are shown at checkout based on your delivery address. You'll see the exact cost and estimated delivery time before you pay.",
    },
    {
      question: "What is your return policy?",
      answer:
        "If something isn't right, contact us and we'll help. See our Terms for the full returns and refunds policy.",
    },
    {
      question: `Prices — what currency are they in?`,
      answer: `All prices are shown in ${currencyLabel(branding.currency)}. Any applicable taxes are shown at checkout.`,
    },
  ];

  const contactBits: string[] = [];
  if (branding.whatsappNumber) contactBits.push("WhatsApp");
  if (branding.instagramHandle)
    contactBits.push(`Instagram (@${branding.instagramHandle})`);
  if (branding.contactEmail)
    contactBits.push(`email (${branding.contactEmail})`);
  const how =
    contactBits.length > 0
      ? `You can reach us via ${contactBits.join(", ")}, or the contact form.`
      : `You can reach us through the contact form.`;
  items.push({
    question: `How do I get in touch with ${branding.storeName}?`,
    answer: how,
  });

  return items;
}

/** Generic "About {store}" content. */
export function genericAbout(branding: Branding): {
  title: string;
  paragraphs: string[];
} {
  return {
    title: `About ${branding.storeName}`,
    paragraphs: [
      `${branding.storeName} sells online and in person. Everything in the shop is available to browse and buy securely, with the same stock kept in sync across the counter and the website.`,
      `Have a question about a product or an order? Get in touch — we're happy to help.`,
    ],
  };
}

/** Generic Terms of Service sections for a storefront (merchant should review). */
export function genericTermsSections(branding: Branding): ContentSection[] {
  const cur = currencyLabel(branding.currency);
  return [
    {
      heading: "1. Prices",
      body: [
        `All prices are shown in ${cur}. Applicable taxes and shipping are shown before you complete your order.`,
      ],
    },
    {
      heading: "2. Orders and payment",
      body: [
        "Placing an order is an offer to purchase. Payment is processed securely by our payment provider; your full card details are never stored on our servers.",
      ],
    },
    {
      heading: "3. Delivery",
      body: [
        "Delivery options, costs, and estimated times are shown at checkout. Title passes to you on full payment.",
      ],
    },
    {
      heading: "4. Returns and refunds",
      body: [
        "Unless required otherwise by law, returns are accepted for unused items in original condition within a reasonable period of receipt. Contact us before returning an item.",
      ],
    },
    {
      heading: "5. Contact",
      body: [
        branding.contactEmail
          ? `Questions about these terms? Contact ${branding.storeName} at ${branding.contactEmail}.`
          : `Questions about these terms? Contact ${branding.storeName} through the contact form.`,
      ],
    },
  ];
}

/** Generic imprint / legal-notice fields. */
export function genericImprint(branding: Branding): {
  title: string;
  lines: string[];
} {
  const lines = [`Operated by ${branding.storeName}.`];
  if (branding.contactEmail) lines.push(`Email: ${branding.contactEmail}`);
  lines.push(
    "This store is responsible for its own listings, fulfilment, and customer service.",
  );
  return { title: "Legal Notice", lines };
}
