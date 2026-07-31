import { describe, expect, it } from "vitest";
import { PLANS, PLAN_FEATURES, featuresForPlan } from "./platform";

/**
 * These exist because the Free/Pro pivot broke two admin screens silently.
 * Both gated on the retired four-tier ids, so they matched no plan at all:
 * Domain.tsx showed paying Pro merchants an upsell for the custom domain they
 * had bought, and Support.tsx told them they had community support. Nothing
 * failed — the copy just quietly contradicted what the pricing page sold.
 */

describe("PLAN_FEATURES", () => {
  it("covers exactly the plans the pricing page sells", () => {
    // The drift that caused the bug: feature keys and plan ids diverging.
    expect(Object.keys(PLAN_FEATURES).sort()).toEqual(
      PLANS.map((p) => p.id).sort(),
    );
  });

  it("gives Pro every capability Free lacks, and never the reverse", () => {
    for (const key of Object.keys(PLAN_FEATURES.free) as (keyof typeof PLAN_FEATURES.free)[]) {
      const free = PLAN_FEATURES.free[key];
      const pro = PLAN_FEATURES.pro[key];
      if (typeof free === "boolean" && typeof pro === "boolean") {
        // Pro may add capabilities; it must never remove one Free has.
        expect(free && !pro).toBe(false);
      }
      if (typeof free === "number" && typeof pro === "number") {
        expect(pro).toBeGreaterThanOrEqual(free);
      }
    }
  });

  it("backs the Pro features the pricing page advertises", () => {
    // Each of these is a promise made on the Pricing card. If a flag here goes
    // false, we are selling something the product then refuses to hand over.
    expect(PLAN_FEATURES.pro.customDomain).toBe(true);
    expect(PLAN_FEATURES.pro.prioritySupport).toBe(true);
    expect(PLAN_FEATURES.pro.whiteLabel).toBe(true);
    expect(PLAN_FEATURES.pro.analytics).toBe("advanced");
    expect(PLAN_FEATURES.pro.maxStaff).toBe(3);

    const proCopy = PLANS.find((p) => p.id === "pro")!.features.join(" ");
    expect(proCopy).toMatch(/custom domain/i);
    expect(proCopy).toMatch(/priority human support/i);
    expect(proCopy).toMatch(/3 staff seats/i);
  });

  it("keeps Free free of the paid capabilities", () => {
    expect(PLAN_FEATURES.free.customDomain).toBe(false);
    expect(PLAN_FEATURES.free.prioritySupport).toBe(false);
    expect(PLAN_FEATURES.free.whiteLabel).toBe(false);
  });

  it("still gives Free the whole commerce engine", () => {
    // Free is monetised by the 1% fee, not by crippling the product — the
    // north-star metric depends on free in-person sellers actually selling.
    expect(PLAN_FEATURES.free.pos).toBe(true);
    expect(PLAN_FEATURES.free.onlineStore).toBe(true);
  });
});

describe("featuresForPlan", () => {
  it("resolves the real plan ids", () => {
    expect(featuresForPlan("pro").customDomain).toBe(true);
    expect(featuresForPlan("free").customDomain).toBe(false);
  });

  it("falls back to Free for a retired tier id, not to Pro", () => {
    // A tenant row could still carry maker/studio/atelier. Under-granting is
    // recoverable; silently treating an unknown plan as Pro would give paid
    // features away to anyone whose plan string went stale.
    for (const retired of ["maker", "studio", "atelier"]) {
      expect(featuresForPlan(retired)).toBe(PLAN_FEATURES.free);
    }
  });

  it("falls back to Free for nonsense rather than throwing", () => {
    for (const junk of ["", "PRO", "enterprise", "undefined"]) {
      expect(featuresForPlan(junk).customDomain).toBe(false);
    }
  });

  it("is what the admin gates should ask, for every sellable plan", () => {
    // Domain.tsx renders the form when this is true and the upsell when false.
    // The pivot bug was that its own copy of the rule answered false for Pro.
    for (const plan of PLANS) {
      expect(typeof featuresForPlan(plan.id).customDomain).toBe("boolean");
    }
    expect(featuresForPlan("pro").customDomain).toBe(true);
  });
});
