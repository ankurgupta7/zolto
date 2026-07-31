import { describe, expect, it } from "vitest";
import { actionFor, describePlan, type CleanupAccount } from "./stripeCleanup";

const TEST = { live: false, liveConfirmed: false };
const LIVE = { live: true, liveConfirmed: true };
const LIVE_UNCONFIRMED = { live: true, liveConfirmed: false };

describe("actionFor", () => {
  it("deletes test-mode accounts regardless of type", () => {
    for (const type of ["standard", "express", "custom", "none", null]) {
      const a: CleanupAccount = { id: "acct_test", type };
      expect(actionFor(a, TEST).kind).toBe("delete");
    }
  });

  it("NEVER deletes a live Standard account — it is the merchant's, not ours", () => {
    // The rule this module exists to enforce. A Standard account is the
    // merchant's own Stripe business; Zolto only holds an authorisation.
    const action = actionFor({ id: "acct_live", type: "standard" }, LIVE);
    expect(action.kind).toBe("deauthorize");
    expect(action.reason).toMatch(/belongs to the merchant/i);
  });

  it("deletes live accounts the platform itself owns", () => {
    for (const type of ["express", "custom"]) {
      const action = actionFor({ id: "acct_live", type }, LIVE);
      expect(action.kind).toBe("delete");
    }
  });

  it("refuses to touch anything live until live mode is confirmed", () => {
    // Default-safe: a live key alone must not be enough to act.
    for (const type of ["standard", "express", "custom", "none"]) {
      const action = actionFor({ id: "acct_live", type }, LIVE_UNCONFIRMED);
      expect(action.kind).toBe("skip");
      expect(action.reason).toMatch(/live mode was not explicitly confirmed/i);
    }
  });

  it("checks the live guard before the type rules", () => {
    // Order matters: an unconfirmed live run must skip even for account types
    // that would otherwise be deletable.
    expect(
      actionFor({ id: "a", type: "custom" }, LIVE_UNCONFIRMED).kind,
    ).toBe("skip");
  });

  it("treats an unknown live type as platform-owned, not as Standard", () => {
    // Deleting something we own by mistake costs a test fixture. Deleting a
    // merchant's own account is not recoverable — so the Standard branch is
    // matched explicitly rather than used as the fallback.
    const action = actionFor({ id: "acct_live", type: "none" }, LIVE);
    expect(action.kind).toBe("delete");
    expect(action.reason).toMatch(/platform-owned/i);
  });
});

describe("describePlan", () => {
  it("counts each kind and renders one scannable line per account", () => {
    const plan = describePlan([
      {
        account: { id: "acct_1" },
        action: actionFor({ id: "acct_1" }, TEST),
      },
      {
        account: { id: "acct_2", type: "standard" },
        action: actionFor({ id: "acct_2", type: "standard" }, LIVE),
      },
      {
        account: { id: "acct_3", type: "standard" },
        action: actionFor({ id: "acct_3", type: "standard" }, LIVE_UNCONFIRMED),
      },
    ]);
    expect(plan.deletes).toBe(1);
    expect(plan.deauthorizes).toBe(1);
    expect(plan.skips).toBe(1);
    expect(plan.lines).toHaveLength(3);
    for (const line of plan.lines) {
      // Every line must name the account, so a dry run can be audited.
      expect(line).toMatch(/acct_\d/);
    }
    expect(plan.lines[0]).toContain("DELETE");
    expect(plan.lines[1]).toContain("DEAUTHORIZE");
    expect(plan.lines[2]).toContain("SKIP");
  });

  it("reports an empty plan as empty rather than as success", () => {
    const plan = describePlan([]);
    expect(plan).toMatchObject({ deletes: 0, deauthorizes: 0, skips: 0 });
    expect(plan.lines).toEqual([]);
  });
});
