import { describe, it, expect } from "vitest";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  FAQS,
  HOW_TO_START,
  formatPrice,
  POSITIONING,
  PRICING_PROMISE,
  COST_COMPARISON,
  INCUMBENT_COMPARISON,
  SELLING_FLOW,
} from "./platform";

describe("platform facts", () => {
  it("has a name, tagline, and summary", () => {
    expect(PLATFORM.name).toBe("Zolto");
    expect(PLATFORM.tagline.length).toBeGreaterThan(0);
    expect(PLATFORM.summary.length).toBeGreaterThan(40);
  });

  it("lists features with unique ids and descriptions", () => {
    expect(FEATURES.length).toBeGreaterThanOrEqual(6);
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FEATURES) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("has a free plan and ascending paid prices", () => {
    expect(PLANS[0].priceEur).toBe(0);
    const paid = PLANS.map((p) => p.priceEur);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]).toBeGreaterThanOrEqual(paid[i - 1]);
    }
    // exactly one highlighted plan
    expect(PLANS.filter((p) => p.highlight).length).toBe(1);
  });

  it("has FAQs and getting-started steps", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.q.endsWith("?")).toBe(true);
      expect(f.a.length).toBeGreaterThan(0);
    }
    expect(HOW_TO_START.length).toBeGreaterThanOrEqual(3);
  });

  it("formats prices with the euro sign", () => {
    expect(formatPrice(0)).toBe("€0");
    expect(formatPrice(19)).toBe("€19");
  });

  it("names the incumbents it positions against", () => {
    expect(POSITIONING.incumbents).toContain("Stripe");
    expect(POSITIONING.incumbents).toContain("SumUp");
    expect(POSITIONING.incumbents).toContain("Worldline");
    expect(POSITIONING.shifts.length).toBe(2);
  });

  it("carries a written pricing pledge", () => {
    expect(PRICING_PROMISE.headline.length).toBeGreaterThan(0);
    expect(PRICING_PROMISE.pledge.toLowerCase()).toContain("never charge");
    expect(PRICING_PROMISE.points.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the cost comparison in sync with the highlighted plan", () => {
    const highlighted = PLANS.find((p) => p.highlight);
    expect(highlighted).toBeTruthy();
    expect(COST_COMPARISON.usPerMonthEur).toBe(highlighted?.priceEur);
    // The whole point is that Zolto is dramatically cheaper than the old way.
    expect(COST_COMPARISON.themPerYearEur).toBeGreaterThan(
      COST_COMPARISON.usPerMonthEur * 12,
    );
  });

  it("has a complete incumbent comparison table", () => {
    expect(INCUMBENT_COMPARISON.length).toBeGreaterThanOrEqual(4);
    for (const row of INCUMBENT_COMPARISON) {
      expect(row.feature.length).toBeGreaterThan(0);
      expect(row.them.length).toBeGreaterThan(0);
      expect(row.us.length).toBeGreaterThan(0);
    }
  });

  it("describes the scan → tap → reconcile selling loop", () => {
    expect(SELLING_FLOW.length).toBe(3);
    for (const step of SELLING_FLOW) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });

  it("exposes the AI-native inventory + tap-to-pay features", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(ids).toContain("tap-to-pay");
    expect(ids).toContain("notebook-inventory");
    expect(ids).toContain("day-end-reconciliation");
  });
});
