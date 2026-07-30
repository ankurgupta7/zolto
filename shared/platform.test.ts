import { describe, it, expect } from "vitest";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  PRO_PLAN,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
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

  it("ships exactly two tiers: Free first, Pro highlighted", () => {
    expect(PLANS.map((p) => p.id)).toEqual(["free", "pro"]);
    expect(PLANS[0].priceChf).toBe(0);
    expect(PRO_PLAN.priceChf).toBeGreaterThan(0);
    expect(PLANS.filter((p) => p.highlight)).toEqual([PRO_PLAN]);
  });

  it("monetizes online/agent sales only — never in person", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    // Free carries the skim on online + agent orders; Pro removes it.
    expect(free.onlineFeeBps).toBe(REVENUE_SHARE.freeBps);
    expect(free.onlineFeeBps).toBeGreaterThan(0);
    expect(PRO_PLAN.onlineFeeBps).toBe(0);
    // In-person is not our channel to tax, on any plan.
    expect(REVENUE_SHARE.inPersonBps).toBe(0);
    // The skim is disclosed on the Free plan card itself.
    expect(free.features.join(" | ")).toMatch(/1% platform fee/i);
  });

  it("keeps the Pro break-even at the locked upsell trigger (~CHF 2,500/mo)", () => {
    expect(PRO_BREAK_EVEN_ONLINE_CHF).toBe(
      Math.round(PRO_PLAN.priceChf / (REVENUE_SHARE.freeBps / 10_000)),
    );
    expect(PRO_BREAK_EVEN_ONLINE_CHF).toBe(2500);
  });

  it("meters on scale (products, storage) — never on AI queries", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    // Scale limits exist and grow with the tier.
    expect(free.maxProducts).toBeGreaterThan(0);
    expect(PRO_PLAN.maxProducts).toBeGreaterThan(free.maxProducts);
    expect(PRO_PLAN.storageGb).toBeGreaterThan(free.storageGb);
    // Free gets a taste of AI photo generation; Pro is unmetered (null).
    expect(free.aiPhotoAllowancePerMonth).toBeGreaterThan(0);
    expect(PRO_PLAN.aiPhotoAllowancePerMonth).toBeNull();
    // No plan may reintroduce per-query AI caps ("N AI descriptions/month").
    for (const plan of PLANS) {
      expect(plan.features.join(" ")).not.toMatch(
        /\d+\s*AI descriptions?\s*\/?\s*month/i,
      );
    }
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

  it("carries a written pricing pledge matching the fee model", () => {
    expect(PRICING_PROMISE.headline.length).toBeGreaterThan(0);
    expect(PRICING_PROMISE.pledge.toLowerCase()).toContain(
      "selling in person is free",
    );
    expect(PRICING_PROMISE.points.length).toBeGreaterThanOrEqual(3);
    const points = PRICING_PROMISE.points.join(" ");
    // The pledge and the fee constants must tell the same story.
    expect(points).toContain(REVENUE_SHARE.percentLabel);
    expect(points).toContain(String(PRO_PLAN.priceChf));
    expect(points).toContain("2,500");
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
