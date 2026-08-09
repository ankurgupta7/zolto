import { describe, expect, it } from "vitest";
import {
  effectivePlan,
  entitlementsFor,
  featuresForTenant,
  isComped,
  isPlanComped,
  normalizePlan,
  onlineFeeBpsFor,
} from "./entitlements";
import { REVENUE_SHARE } from "./platform";

describe("normalizePlan", () => {
  it("passes through the two plans we sell", () => {
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("pro")).toBe("pro");
  });

  it("reads anything else as free", () => {
    // Retired pre-pivot tiers still sit in old rows; nonsense can arrive from a
    // URL. Under-granting is recoverable — silently granting Pro is not.
    for (const junk of ["atelier", "studio", "maker", "", null, undefined]) {
      expect(normalizePlan(junk)).toBe("free");
    }
  });
});

describe("effectivePlan", () => {
  it("is the paid plan when nothing is comped", () => {
    expect(effectivePlan({ plan: "free" })).toBe("free");
    expect(effectivePlan({ plan: "pro" })).toBe("pro");
    expect(effectivePlan({ plan: "free", compPlan: null })).toBe("free");
  });

  it("lifts a free store to a comped Pro", () => {
    expect(effectivePlan({ plan: "free", compPlan: "pro" })).toBe("pro");
  });

  it("never demotes a store that pays for more than it was granted", () => {
    // A stale `comp_plan: "free"` on a merchant who has since bought Pro must
    // not take Pro away — the comp is a floor, not an assignment.
    expect(effectivePlan({ plan: "pro", compPlan: "free" })).toBe("pro");
  });

  it("survives a plan column Stripe has reset to free", () => {
    // customer.subscription.deleted writes plan = 'free' (server/billing.ts).
    // The comp lives in its own column precisely so that cannot revoke it.
    expect(effectivePlan({ plan: "free", compPlan: "pro" })).toBe("pro");
  });
});

describe("featuresForTenant", () => {
  it("gives a comped store the Pro feature set", () => {
    const comped = featuresForTenant({ plan: "free", compPlan: "pro" });
    expect(comped.customDomain).toBe(true);
    expect(comped.whiteLabel).toBe(true);
    expect(comped.prioritySupport).toBe(true);
    expect(comped.maxStaff).toBe(3);
  });

  it("leaves an ordinary free store on the free feature set", () => {
    expect(featuresForTenant({ plan: "free" }).customDomain).toBe(false);
  });

  it("does not grant plan features for a bare fee waiver", () => {
    // Waiving the skim is a pricing favour, not an entitlement one.
    const waived = featuresForTenant({ plan: "free", compFeeWaived: true });
    expect(waived.customDomain).toBe(false);
  });
});

describe("onlineFeeBpsFor", () => {
  it("charges the standard 1% on an ordinary free store", () => {
    expect(onlineFeeBpsFor({ plan: "free" })).toBe(REVENUE_SHARE.freeBps);
  });

  it("charges nothing on Pro", () => {
    expect(onlineFeeBpsFor({ plan: "pro" })).toBe(0);
  });

  it("charges nothing on a comped Pro", () => {
    expect(onlineFeeBpsFor({ plan: "free", compPlan: "pro" })).toBe(0);
  });

  it("charges nothing when the fee alone is waived", () => {
    expect(onlineFeeBpsFor({ plan: "free", compFeeWaived: true })).toBe(0);
  });

  it("treats an unknown plan as free rather than free-of-charge", () => {
    expect(onlineFeeBpsFor({ plan: "atelier" })).toBe(REVENUE_SHARE.freeBps);
  });
});

describe("isPlanComped / isComped", () => {
  it("marks a granted plan as comped", () => {
    expect(isPlanComped({ plan: "free", compPlan: "pro" })).toBe(true);
    expect(isComped({ plan: "free", compPlan: "pro" })).toBe(true);
  });

  it("does not call a paying Pro store comped", () => {
    expect(isPlanComped({ plan: "pro" })).toBe(false);
    expect(isPlanComped({ plan: "pro", compPlan: "pro" })).toBe(false);
    expect(isComped({ plan: "pro" })).toBe(false);
  });

  it("counts a bare fee waiver as comped, but not as a comped plan", () => {
    const t = { plan: "free", compFeeWaived: true };
    expect(isPlanComped(t)).toBe(false);
    expect(isComped(t)).toBe(true);
  });
});

describe("entitlementsFor", () => {
  it("describes an ordinary free store", () => {
    expect(entitlementsFor({ plan: "free" })).toEqual({
      paidPlan: "free",
      effectivePlan: "free",
      compPlan: null,
      onlineFeeBps: REVENUE_SHARE.freeBps,
      planComped: false,
      feeWaived: false,
      comped: false,
    });
  });

  it("describes a store comped onto Pro", () => {
    expect(
      entitlementsFor({ plan: "free", compPlan: "pro", compFeeWaived: false }),
    ).toEqual({
      paidPlan: "free",
      effectivePlan: "pro",
      compPlan: "pro",
      onlineFeeBps: 0,
      planComped: true,
      feeWaived: false,
      comped: true,
    });
  });

  it("keeps the paid plan visible under a comp", () => {
    // The operator needs both numbers: what Stripe bills, and what we granted.
    const e = entitlementsFor({ plan: "free", compPlan: "pro" });
    expect(e.paidPlan).toBe("free");
    expect(e.effectivePlan).toBe("pro");
  });
});
