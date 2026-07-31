import { describe, expect, it } from "vitest";
import {
  FAQS,
  FEATURES,
  HOW_TO_START,
  PLANS,
  PLATFORM,
  PRICING_PROMISE,
} from "./platform";

/**
 * Zolto answers on exactly one domain: zolto.ch, and its subdomains for tenant
 * storefronts (server/_core/platformDomain.ts derives the root from
 * PUBLIC_BASE_URL). Nothing customer-facing may advertise another.
 *
 * The Free plan's feature list once promised "an online store on a zolto.shop
 * address" — a domain the platform neither served nor owned. That string is not
 * page copy: FEATURES feeds the pricing card, /llms.txt and the platform MCP
 * tools, so human visitors and AI agents were being handed an address that
 * resolved to nothing, and any squatter could have registered it and phished
 * merchants with a name Zolto itself was publishing.
 *
 * This asserts on the constants' VALUES rather than grepping source, so a
 * comment can still explain the history without tripping the guard.
 */

/** Every string a shopper, merchant or agent can read, flattened. */
function marketingStrings(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const [key, value] of Object.entries(PLATFORM)) {
    out.push({ where: `PLATFORM.${key}`, text: String(value) });
  }
  for (const f of FEATURES) {
    out.push({ where: `FEATURES[${f.id}].name`, text: f.name });
    out.push({ where: `FEATURES[${f.id}].description`, text: f.description });
  }
  for (const p of PLANS) {
    out.push({ where: `PLANS[${p.id}].blurb`, text: p.blurb });
    for (const feat of p.features) {
      out.push({ where: `PLANS[${p.id}].features`, text: feat });
    }
  }
  for (const f of FAQS) {
    out.push({ where: `FAQS "${f.q}"`, text: `${f.q} ${f.a}` });
  }
  out.push({ where: "PRICING_PROMISE.headline", text: PRICING_PROMISE.headline });
  out.push({ where: "PRICING_PROMISE.pledge", text: PRICING_PROMISE.pledge });
  for (const point of PRICING_PROMISE.points) {
    out.push({ where: "PRICING_PROMISE.points", text: point });
  }
  for (const step of HOW_TO_START) {
    out.push({ where: "HOW_TO_START", text: step });
  }
  return out;
}

/**
 * Domains mentioned in a string. Deliberately loose — it should catch
 * "zolto.shop" written in prose, not just a full URL.
 */
function domainsIn(text: string): string[] {
  const matches = text.match(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi);
  return matches ?? [];
}

/** Domains legitimately named in copy: ours, plus third parties we discuss. */
const ALLOWED = new Set([
  "zolto.ch",
  // Named in comparison and integration copy — real companies, not Zolto hosts.
  "stripe.com",
  "sumup.com",
  "worldline.com",
  "shopify.com",
  "square.com",
]);

/** Filenames and protocol names the loose matcher will also pick up. */
const NOT_A_DOMAIN = /^(llms\.txt|llms-full\.txt|robots\.txt|sitemap\.xml)$/i;

describe("platform copy names only domains Zolto serves", () => {
  it("mentions no domain other than zolto.ch", () => {
    const offenders: string[] = [];
    for (const { where, text } of marketingStrings()) {
      for (const domain of domainsIn(text)) {
        const d = domain.toLowerCase();
        if (NOT_A_DOMAIN.test(d)) continue;
        if (ALLOWED.has(d)) continue;
        offenders.push(`${where}: "${domain}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never names the retired storefront domain", () => {
    // The specific regression. Kept as its own case so a failure says exactly
    // what went wrong rather than dumping the whole allow-list diff.
    for (const { where, text } of marketingStrings()) {
      expect(`${where} :: ${text}`).not.toMatch(/zolto\.shop/i);
    }
  });

  it("still tells merchants where their store lives", () => {
    // The fix must not have simply deleted the promise. A merchant choosing
    // Free needs to know they get a web address at all.
    const free = PLANS.find((p) => p.id === "free")!;
    const addressLine = free.features.find((f) => /zolto\.ch/i.test(f));
    expect(addressLine).toBeDefined();
    expect(addressLine).toMatch(/online store/i);
  });

  it("guards the surfaces agents read, not just the pricing page", () => {
    // FEATURES and PLATFORM are what /llms.txt and the MCP platform tools
    // serialise, which is why a wrong domain here is worse than a typo on a
    // page: an AI assistant repeats it to buyers as fact.
    expect(FEATURES.length).toBeGreaterThan(0);
    expect(PLATFORM.summary.length).toBeGreaterThan(0);
    for (const f of FEATURES) {
      expect(f.description).not.toMatch(/zolto\.shop/i);
    }
    expect(PLATFORM.summary).not.toMatch(/zolto\.shop/i);
    expect(PLATFORM.pricingSummary).not.toMatch(/zolto\.shop/i);
  });
});
