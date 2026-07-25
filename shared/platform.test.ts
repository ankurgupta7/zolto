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
  AI_PHOTO_CREDITS,
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
    expect(PLANS[0].priceChf).toBe(0);
    const paid = PLANS.map((p) => p.priceChf);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]).toBeGreaterThanOrEqual(paid[i - 1]);
    }
    // exactly one highlighted plan
    expect(PLANS.filter((p) => p.highlight).length).toBe(1);
  });

  it("keeps the free plan a complete store, not a capped demo", () => {
    const free = PLANS.find((p) => p.id === "free");
    expect(free).toBeTruthy();
    const text = free!.features.join(" | ");
    // Zero-marginal-cost features are free, not gated behind a paywall.
    expect(text).toMatch(/unlimited products/i);
    expect(text).toMatch(/data export/i);
    // The old manufactured-scarcity caps must not come back.
    expect(text).not.toMatch(/up to 50 products/i);
    expect(text).not.toMatch(/\d+\s*AI descriptions?\s*\/?\s*month/i);
  });

  it("meters AI photo generation instead of bundling it as 'unlimited'", () => {
    // "Unlimited AI" hides a real per-image GPU cost — it must not appear on any plan.
    for (const plan of PLANS) {
      for (const f of plan.features) {
        expect(f.toLowerCase()).not.toContain("unlimited ai");
      }
    }
    // Photo credits are a real, priced, metered add-on.
    expect(AI_PHOTO_CREDITS.priceChf).toBeGreaterThan(0);
    expect(AI_PHOTO_CREDITS.unit.length).toBeGreaterThan(0);
    expect(AI_PHOTO_CREDITS.points.length).toBeGreaterThanOrEqual(3);
    expect(AI_PHOTO_CREDITS.points.join(" ").toLowerCase()).toContain(
      "never expire",
    );
  });

  it("includes a non-decreasing monthly photo-credit bucket per plan", () => {
    const buckets = PLANS.map((p) => p.includedPhotoCredits);
    expect(PLANS[0].includedPhotoCredits).toBe(0); // Free: pay-as-you-go only
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]).toBeGreaterThanOrEqual(buckets[i - 1]);
    }
    // Paid plans actually grant credits.
    expect(buckets[buckets.length - 1]).toBeGreaterThan(0);
  });

  it("has FAQs and getting-started steps", () => {
    expect(FAQS.length).toBeGreaterThanOrEqual(5);
    for (const f of FAQS) {
      expect(f.q.endsWith("?")).toBe(true);
      expect(f.a.length).toBeGreaterThan(0);
    }
    expect(HOW_TO_START.length).toBeGreaterThanOrEqual(3);
  });

  it("formats prices in Swiss francs", () => {
    expect(formatPrice(0)).toBe("CHF 0");
    expect(formatPrice(19)).toBe("CHF 19");
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
    expect(COST_COMPARISON.usPerMonthChf).toBe(highlighted?.priceChf);
    // The whole point is that Zolto is dramatically cheaper than the old way.
    expect(COST_COMPARISON.themPerYearChf).toBeGreaterThan(
      COST_COMPARISON.usPerMonthChf * 12,
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
