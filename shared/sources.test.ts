import { describe, it, expect } from "vitest";
import { SOURCES, source, sources } from "./sources";
import { RATES, NEGOTIATED } from "./costOfAcceptance";

describe("SOURCES", () => {
  it("gives every source a unique id, a label and a URL", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCES) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  it("dates every source, because an undated figure is an unfalsifiable one", () => {
    // retrievedOn is the whole point of this module: it turns "this is true"
    // into "this was true on this date, here's where to check".
    for (const s of SOURCES) {
      expect(s.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(s.retrievedOn))).toBe(false);
    }
  });

  it("keeps a note on the two sources that are weaker than they look", () => {
    // Both are named in the review as figures to confirm before quoting. If
    // either ever ships without its caveat, the page starts overstating what it
    // knows — which is the failure this registry exists to prevent.
    expect(source("stripe-ch-pricing").note).toMatch(/EEA|bucket|Swiss/i);
    expect(source("worldline-saferpay-prices").note).toMatch(/09\.2022|dated/i);
  });
});

describe("source()", () => {
  it("resolves a known id", () => {
    expect(source("twint-merchant-fees").label).toMatch(/TWINT/);
  });

  it("throws on an unknown id rather than returning undefined", () => {
    // Same grounding rule as segmentFeatures() in shared/segments.ts: a
    // citation that silently vanishes leaves a figure with nothing behind it.
    expect(() => source("no-such-source")).toThrow(/Unknown source id/);
  });

  it("resolves a list in order", () => {
    const got = sources(["twint-merchant-fees", "stripe-ch-pricing"]);
    expect(got.map((s) => s.id)).toEqual([
      "twint-merchant-fees",
      "stripe-ch-pricing",
    ]);
  });
});

describe("every published figure is sourced", () => {
  it("resolves the sourceId on every rate", () => {
    for (const r of RATES) {
      expect(() => source(r.sourceId)).not.toThrow();
    }
  });

  it("resolves the sourceId on every negotiated offering", () => {
    for (const n of NEGOTIATED) {
      expect(() => source(n.sourceId)).not.toThrow();
    }
  });
});
