// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  FAQS,
  FAQ_CATEGORIES,
  PLANS,
  PLATFORM,
  PRICING_PROMISE,
  COST_COMPARISON,
  ZERO_COST_POS,
  AI_NATIVE_PITCH,
  SELLING_FLOW,
  CARD_READER_GAG,
  INCUMBENT_COMPARISON,
  REVENUE_SHARE,
} from "@shared/platform";
import enLocale from "./en.json";
import deLocale from "./de.json";
import frLocale from "./fr.json";
import itLocale from "./it.json";

/**
 * Collect every key path in a locale tree. Arrays contribute indexed paths so
 * a language that drops (or adds) a bullet point is caught, not just one that
 * drops a whole section.
 */
function keyPaths(node: unknown, prefix = ""): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  }
  if (node !== null && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      keyPaths(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

const LOCALES = {
  en: enLocale,
  de: deLocale,
  fr: frLocale,
  it: itLocale,
} as const;

describe("marketing locale files", () => {
  it("keep identical key structures across all four languages", () => {
    const reference = keyPaths(enLocale).sort();
    for (const [lang, resources] of Object.entries(LOCALES)) {
      expect(keyPaths(resources).sort(), `structure of ${lang}.json`).toEqual(
        reference,
      );
    }
  });

  it("never ship an empty or non-string leaf", () => {
    for (const [lang, resources] of Object.entries(LOCALES)) {
      const walk = (node: unknown, path: string) => {
        if (Array.isArray(node)) {
          node.forEach((v, i) => walk(v, `${path}[${i}]`));
        } else if (node !== null && typeof node === "object") {
          for (const [k, v] of Object.entries(
            node as Record<string, unknown>,
          )) {
            walk(v, `${path}.${k}`);
          }
        } else {
          expect(typeof node, `${lang}:${path}`).toBe("string");
          expect(
            (node as string).trim().length,
            `${lang}:${path}`,
          ).toBeGreaterThan(0);
        }
      };
      walk(resources, lang);
    }
  });

  it("keeps interpolation placeholders consistent with English", () => {
    // A translation that loses {{saving}} (or invents {{Saving}}) renders a
    // literal brace-less sentence or an empty slot — catch it structurally.
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]).sort();
    const flat = (node: unknown, prefix = ""): Array<[string, string]> => {
      if (Array.isArray(node))
        return node.flatMap((v, i) => flat(v, `${prefix}[${i}]`));
      if (node !== null && typeof node === "object")
        return Object.entries(node as Record<string, unknown>).flatMap(
          ([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k),
        );
      return [[prefix, node as string]];
    };
    const reference = new Map(flat(enLocale));
    for (const [lang, resources] of Object.entries(LOCALES)) {
      if (lang === "en") continue;
      for (const [path, value] of flat(resources)) {
        const enValue = reference.get(path);
        expect(enValue, `${lang}:${path} exists in en`).toBeDefined();
        expect(placeholders(value), `${lang}:${path} placeholders`).toEqual(
          placeholders(enValue as string),
        );
      }
    }
  });

  it("mirrors the shared/platform English copy verbatim in en.json (the fallback contract)", () => {
    // The `shared` section of en.json exists so all four languages have the
    // same structure; its values must stay byte-identical to shared/platform,
    // otherwise a rewording there would silently ship two English versions.
    const expectedShared = {
      platform: { pricingSummary: PLATFORM.pricingSummary },
      revenueShare: { appliesTo: REVENUE_SHARE.appliesTo },
      plans: Object.fromEntries(
        PLANS.map((p) => [
          p.id,
          {
            name: p.name,
            blurb: p.blurb,
            cta: p.cta,
            features: [...p.features],
          },
        ]),
      ),
      pricingPromise: {
        headline: PRICING_PROMISE.headline,
        pledge: PRICING_PROMISE.pledge,
        points: [...PRICING_PROMISE.points],
      },
      costComparison: {
        themLabel: COST_COMPARISON.themLabel,
        themNote: COST_COMPARISON.themNote,
        usLabel: COST_COMPARISON.usLabel,
        usNote: COST_COMPARISON.usNote,
        multiplier: COST_COMPARISON.multiplier,
      },
      zeroCostPos: {
        eyebrow: ZERO_COST_POS.eyebrow,
        headline: ZERO_COST_POS.headline,
        headlineEmphasis: ZERO_COST_POS.headlineEmphasis,
        body: ZERO_COST_POS.body,
        includes: [...ZERO_COST_POS.includes],
        catch: ZERO_COST_POS.catch,
      },
      aiNativePitch: {
        eyebrow: AI_NATIVE_PITCH.eyebrow,
        headline: AI_NATIVE_PITCH.headline,
        headlineEmphasis: AI_NATIVE_PITCH.headlineEmphasis,
        body: AI_NATIVE_PITCH.body,
        chart: {
          title: AI_NATIVE_PITCH.chart.title,
          decliningLabel: AI_NATIVE_PITCH.chart.decliningLabel,
          risingLabel: AI_NATIVE_PITCH.chart.risingLabel,
          caption: AI_NATIVE_PITCH.chart.caption,
        },
        proof: {
          eyebrow: AI_NATIVE_PITCH.proof.eyebrow,
          headline: AI_NATIVE_PITCH.proof.headline,
          body: AI_NATIVE_PITCH.proof.body,
        },
        steps: AI_NATIVE_PITCH.steps.map((s) => ({
          k: s.k,
          title: s.title,
          body: s.body,
        })),
        footnote: AI_NATIVE_PITCH.footnote,
      },
      sellingFlow: SELLING_FLOW.map((s) => ({
        title: s.title,
        detail: s.detail,
        timeOfDay: s.timeOfDay,
      })),
      cardReaderGag: { items: [...CARD_READER_GAG.items] },
      comparison: Object.fromEntries(
        INCUMBENT_COMPARISON.map((r) => [
          r.feature,
          { feature: r.feature, them: r.them, us: r.us },
        ]),
      ),
      faqCategories: Object.fromEntries(FAQ_CATEGORIES.map((c) => [c, c])),
      faqs: Object.fromEntries(FAQS.map((f) => [f.q, { q: f.q, a: f.a }])),
    };

    expect(enLocale.shared).toEqual(expectedShared);
  });

  it("translates every shared FAQ in every language (no English leaking by accident)", () => {
    for (const [lang, resources] of Object.entries(LOCALES)) {
      if (lang === "en") continue;
      for (const f of FAQS) {
        const entry = (
          resources.shared.faqs as Record<string, { q: string; a: string }>
        )[f.q];
        expect(entry, `${lang} FAQ "${f.q}"`).toBeDefined();
        expect(entry.a, `${lang} FAQ answer for "${f.q}"`).not.toBe(f.a);
      }
    }
  });
});
