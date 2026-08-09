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
  MAKER_PITCH,
  AI_NATIVE_PITCH,
  SELLING_FLOW,
  CARD_READER_GAG,
  INCUMBENT_COMPARISON,
  REVENUE_SHARE,
  DATA_RESIDENCY,
  SOVEREIGNTY,
  FEATURES,
  COMPETITORS,
  POSITIONING,
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ZOLTO_LIMITATIONS,
  BUYER_FIT,
} from "@shared/platform";
import { RATES, NEGOTIATED } from "@shared/costOfAcceptance";
import { SEGMENTS } from "@shared/segments";
import {
  PILOT_METHODOLOGY,
  PILOT_METRICS,
  PILOT_WEEKLY,
  PILOT_SOURCES,
  PILOT_FINDINGS,
  type ResearchTable,
} from "@shared/research";
import { STORE_TEMPLATES } from "@shared/templates";
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

/** The translatable half of a research table: its caption, head, row labels. */
function researchTable(table: ResearchTable) {
  return {
    caption: table.caption,
    head: [...table.head],
    rowLabels: table.rows.map((r) => r[0]),
  };
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
      makerPitch: {
        eyebrow: MAKER_PITCH.eyebrow,
        headline: MAKER_PITCH.headline,
        headlineEmphasis: MAKER_PITCH.headlineEmphasis,
        body: MAKER_PITCH.body,
        till: {
          title: MAKER_PITCH.till.title,
          methods: MAKER_PITCH.till.methods,
          caption: MAKER_PITCH.till.caption,
        },
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
      // SqueezePlay.tsx renders POSITIONING.squeezePlay. The panels' `sourceId`
      // is absent on purpose: a citation is a URL and a date, not prose, and it
      // renders from shared/sources.ts identically in every language.
      squeezePlay: {
        eyebrow: POSITIONING.squeezePlay.eyebrow,
        headline: POSITIONING.squeezePlay.headline,
        headlineEmphasis: POSITIONING.squeezePlay.headlineEmphasis,
        body: POSITIONING.squeezePlay.body,
        panels: POSITIONING.squeezePlay.panels.map((p) => ({
          label: p.label,
          detail: p.detail,
        })),
        claim: POSITIONING.squeezePlay.claim,
      },
      comparison: Object.fromEntries(
        INCUMBENT_COMPARISON.map((r) => [
          r.feature,
          { feature: r.feature, them: r.them, us: r.us },
        ]),
      ),
      faqCategories: Object.fromEntries(FAQ_CATEGORIES.map((c) => [c, c])),
      // The residency band and the Swissness ledger. The ledger's `next` is
      // optional in the source, so a row without one contributes no key —
      // which the structural test then requires every language to match.
      dataResidency: {
        eyebrow: DATA_RESIDENCY.eyebrow,
        headline: DATA_RESIDENCY.headline,
        headlineEmphasis: DATA_RESIDENCY.headlineEmphasis,
        provider: DATA_RESIDENCY.provider,
        region: DATA_RESIDENCY.region,
        primaryCountry: DATA_RESIDENCY.primaryCountry,
        body: DATA_RESIDENCY.body,
        points: [...DATA_RESIDENCY.points],
        caveat: DATA_RESIDENCY.caveat,
      },
      sovereignty: {
        eyebrow: SOVEREIGNTY.eyebrow,
        headline: SOVEREIGNTY.headline,
        headlineEmphasis: SOVEREIGNTY.headlineEmphasis,
        serving: SOVEREIGNTY.serving,
        body: SOVEREIGNTY.body,
        ledger: SOVEREIGNTY.ledger.map((e) => ({
          piece: e.piece,
          today: e.today,
          ...(e.next ? { next: e.next } : {}),
        })),
        why: [...SOVEREIGNTY.why],
        promise: SOVEREIGNTY.promise,
        heroBadges: [...SOVEREIGNTY.heroBadges],
      },
      faqs: Object.fromEntries(FAQS.map((f) => [f.q, { q: f.q, a: f.a }])),
      // Segment.tsx renders SEGMENTS and the FEATURES they resolve to, so both
      // are translated through `st()` and both belong to the same contract.
      segments: Object.fromEntries(
        SEGMENTS.map((s) => [
          s.id,
          {
            name: s.name,
            headline: s.headline,
            summary: s.summary,
            painPoints: [...s.painPoints],
            scenario: s.scenario,
          },
        ]),
      ),
      features: Object.fromEntries(
        FEATURES.map((f) => [
          f.id,
          { name: f.name, description: f.description },
        ]),
      ),
      // Signup.tsx renders STORE_TEMPLATES. The template names are left out —
      // "Atelier" and "Azure" are the same word in every language.
      templates: Object.fromEntries(
        STORE_TEMPLATES.map((t) => [
          t.id,
          { tagline: t.tagline, bestFor: t.bestFor },
        ]),
      ),
      // Compare.tsx renders COMPETITORS. Brand names are left out on purpose —
      // "SumUp" is the same word in every language.
      competitors: Object.fromEntries(
        COMPETITORS.map((c) => [
          c.id,
          {
            summary: c.summary,
            betterWhen: [...c.betterWhen],
            zoltoWhen: [...c.zoltoWhen],
            ...(c.capabilities
              ? {
                  capabilities: Object.fromEntries(
                    c.capabilities.map((x) => [x.key, x.value]),
                  ),
                }
              : {}),
            // The "yes, but what it costs" lines. Only rows that carry one
            // contribute a key, which the structural test then requires every
            // language to match.
            ...(c.capabilities?.some((x) => x.cost)
              ? {
                  costs: Object.fromEntries(
                    c.capabilities
                      .filter((x) => x.cost)
                      .map((x) => [x.key, x.cost]),
                  ),
                }
              : {}),
            // Only the statement is translated. Its source is a URL and a
            // date, which read the same in every language.
            ...(c.risks ? { risks: c.risks.map((r) => r.statement) } : {}),
          },
        ]),
      ),
      // CapabilityMatrix.tsx renders the row labels and Zolto's own answers.
      capabilities: Object.fromEntries(
        CAPABILITIES.map((c) => [c.key, { label: c.label, zolto: c.zolto }]),
      ),
      capabilityGroups: Object.fromEntries(
        CAPABILITY_GROUPS.map((g) => [g, g]),
      ),
      // CostOfAcceptance.tsx renders each rate's label and caveat. The numbers
      // themselves are never duplicated into a locale file — they render from
      // shared/costOfAcceptance.ts so four languages can't disagree about what
      // a sale costs.
      rates: Object.fromEntries(
        RATES.map((r) => [
          r.id,
          r.caveat ? { label: r.label, caveat: r.caveat } : { label: r.label },
        ]),
      ),
      negotiated: Object.fromEntries(
        NEGOTIATED.map((n) => [n.id, { label: n.label, detail: n.detail }]),
      ),
      // Compare.tsx's index renders both. They're the two places the site
      // argues against itself, so they matter most in the languages a reader
      // actually reads.
      limitations: ZOLTO_LIMITATIONS.map((l) => ({
        title: l.title,
        detail: l.detail,
      })),
      buyerFit: BUYER_FIT.map((q) => ({
        question: q.question,
        answers: q.answers.map((a) => ({ when: a.when, then: a.then })),
      })),
      // Research.tsx renders shared/research.ts. Only the label column of each
      // table is prose — the numeric cells are rendered from the shared source
      // as-is, so they are deliberately absent from the locale files.
      research: {
        title: PILOT_METHODOLOGY.title,
        sample: PILOT_METHODOLOGY.sample,
        collection: PILOT_METHODOLOGY.collection,
        limits: [...PILOT_METHODOLOGY.limits],
        findings: [...PILOT_FINDINGS],
        metrics: Object.fromEntries(
          PILOT_METRICS.map((m) => [
            m.label,
            { label: m.label, value: m.value, note: m.note },
          ]),
        ),
        tables: {
          weekly: researchTable(PILOT_WEEKLY),
          sources: researchTable(PILOT_SOURCES),
        },
      },
    };

    expect(enLocale.shared).toEqual(expectedShared);
  });

  it("keeps the hero's underlined phrase short in every language", () => {
    // The English source is guarded in platform.test.ts; this is the same
    // guard for the three translations, which is where it is likeliest to be
    // broken — a translator has no way to see that an extra word drags the
    // sketch underline across the column on a phone. See the doc comment on
    // MAKER_PITCH.headlineEmphasis for the measurements.
    for (const [lang, resources] of Object.entries(LOCALES)) {
      const emphasis = (
        resources.shared.makerPitch as { headlineEmphasis: string }
      ).headlineEmphasis;
      expect(emphasis.length, `${lang} hero emphasis`).toBeLessThanOrEqual(30);
    }
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
