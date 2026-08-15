import { describe, it, expect } from "vitest";
import {
  formatTrustScore,
  normaliseTrustpilotDomain,
  starBuckets,
  trustpilotEvaluateUrl,
  trustpilotProfileUrl,
  trustScoreLabel,
} from "./trustpilot";

describe("normaliseTrustpilotDomain", () => {
  it("accepts a bare domain", () => {
    expect(normaliseTrustpilotDomain("kalakosh.ch")).toBe("kalakosh.ch");
  });

  it("lower-cases and trims", () => {
    expect(normaliseTrustpilotDomain("  KalaKosh.CH ")).toBe("kalakosh.ch");
  });

  it("strips a scheme, www, path and query", () => {
    expect(
      normaliseTrustpilotDomain("https://www.kalakosh.ch/shop?utm=x"),
    ).toBe("kalakosh.ch");
  });

  it("pulls the business unit out of a pasted Trustpilot profile URL", () => {
    expect(
      normaliseTrustpilotDomain("https://ch.trustpilot.com/review/kalakosh.ch"),
    ).toBe("kalakosh.ch");
    expect(
      normaliseTrustpilotDomain(
        "https://www.trustpilot.com/review/kalakosh.ch?utm_source=badge",
      ),
    ).toBe("kalakosh.ch");
  });

  it("drops a trailing DNS dot", () => {
    expect(normaliseTrustpilotDomain("kalakosh.ch.")).toBe("kalakosh.ch");
  });

  it("refuses anything that is not a domain", () => {
    for (const bad of [
      "",
      "   ",
      null,
      undefined,
      "not a domain",
      "kalakosh",
      "ch",
      "-kalakosh.ch",
      "kalakosh.c",
      "http://",
    ]) {
      expect(normaliseTrustpilotDomain(bad)).toBeNull();
    }
  });
});

describe("URL builders", () => {
  it("builds the Swiss profile and evaluate URLs", () => {
    expect(trustpilotProfileUrl("kalakosh.ch")).toBe(
      "https://ch.trustpilot.com/review/kalakosh.ch",
    );
    expect(trustpilotEvaluateUrl("kalakosh.ch")).toBe(
      "https://ch.trustpilot.com/evaluate/kalakosh.ch",
    );
  });
});

describe("starBuckets", () => {
  it("rounds to the nearest half star, like Trustpilot's own widgets", () => {
    expect(starBuckets(4.3)).toEqual({ full: 4, half: 1, empty: 0 });
    // 4.7 is nearer 4.5 than 5.0 — a store showing five full stars for it
    // would look better on its own site than it does on Trustpilot's.
    expect(starBuckets(4.7)).toEqual({ full: 4, half: 1, empty: 0 });
    expect(starBuckets(4.8)).toEqual({ full: 5, half: 0, empty: 0 });
    expect(starBuckets(3.0)).toEqual({ full: 3, half: 0, empty: 2 });
  });

  it("always draws exactly five stars", () => {
    for (const score of [0, 0.2, 1.4, 2.5, 3.9, 5, 7, -3, Number.NaN]) {
      const { full, half, empty } = starBuckets(score);
      expect(full + half + empty).toBe(5);
      expect(full).toBeGreaterThanOrEqual(0);
      expect(empty).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("formatTrustScore", () => {
  it("always shows one decimal", () => {
    expect(formatTrustScore(4)).toBe("4.0");
    expect(formatTrustScore(4.26)).toBe("4.3");
  });

  it("clamps out-of-range and non-finite scores", () => {
    expect(formatTrustScore(9)).toBe("5.0");
    expect(formatTrustScore(-1)).toBe("0.0");
    expect(formatTrustScore(Number.NaN)).toBe("0.0");
  });
});

describe("trustScoreLabel", () => {
  it("uses Trustpilot's published bands", () => {
    expect(trustScoreLabel(4.8)).toBe("Excellent");
    expect(trustScoreLabel(4.3)).toBe("Excellent");
    expect(trustScoreLabel(4.0)).toBe("Great");
    expect(trustScoreLabel(3.2)).toBe("Average");
    expect(trustScoreLabel(2.4)).toBe("Poor");
    expect(trustScoreLabel(1.1)).toBe("Bad");
  });
});
