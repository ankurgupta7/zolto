/**
 * Zolto pricing tiers — single source of truth for the marketing pricing page.
 * Mirrors docs/planning/phase1/marketing/pricing-page-copy.md and business-plan §3.1/§4.2.
 * Prices are placeholders pending the §7.1 VAT-inclusive-vs-exclusive decision.
 */

export interface Plan {
  id: "free" | "maker" | "studio" | "atelier";
  name: string;
  priceEur: number;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    blurb: "For makers exploring.",
    cta: "Get started free",
    features: [
      "Up to 50 products",
      "1 staff member",
      "Basic POS",
      "10 AI descriptions / month",
      "Community support",
    ],
  },
  {
    id: "maker",
    name: "Maker",
    priceEur: 19,
    blurb: "For solo makers.",
    cta: "Start 14-day free trial",
    highlight: true,
    features: [
      "Unlimited products",
      "Full POS + online store",
      "Unlimited AI descriptions",
      "Bulk upload",
      "Real-time inventory sync",
      "Email support",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    priceEur: 49,
    blurb: "For small teams.",
    cta: "Start 14-day free trial",
    features: [
      "Everything in Maker",
      "5 staff members",
      "Custom domain",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    id: "atelier",
    name: "Atelier",
    priceEur: 99,
    blurb: "For growing brands.",
    cta: "Contact sales",
    features: [
      "Everything in Studio",
      "20 staff members",
      "API access",
      "Custom AI training",
      "Dedicated support + SLA",
    ],
  },
];

export function formatPrice(eur: number): string {
  return eur === 0 ? "€0" : `€${eur}`;
}
