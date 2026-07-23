import { describe, it, expect } from "vitest";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  FAQS,
  HOW_TO_START,
  formatPrice,
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
});
