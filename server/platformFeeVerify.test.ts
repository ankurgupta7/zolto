import { describe, expect, it } from "vitest";
import { chf, summarise, verdictFor } from "./platformFeeVerify";
import { platformFeeRappen } from "./checkoutSession";

describe("chf", () => {
  it("renders Rappen as Swiss francs", () => {
    expect(chf(0)).toBe("CHF 0.00");
    expect(chf(5)).toBe("CHF 0.05");
    expect(chf(123)).toBe("CHF 1.23");
    expect(chf(250000)).toBe("CHF 2500.00");
  });
});

describe("verdictFor", () => {
  it("passes when the expected fee is collected exactly", () => {
    const v = verdictFor({ expectedFeeRappen: 100, observedFeeRappen: 100 });
    expect(v.kind).toBe("collected");
    expect(v.pass).toBe(true);
  });

  it("passes when nothing was expected and nothing was taken (Pro)", () => {
    const v = verdictFor({ expectedFeeRappen: 0, observedFeeRappen: null });
    expect(v.kind).toBe("not_charged");
    expect(v.pass).toBe(true);
  });

  it("FAILS when the charge settled without the expected fee", () => {
    // The whole point of the exercise. The payment succeeded, so every
    // outward signal says "working storefront" while Gwinn earns nothing.
    const v = verdictFor({ expectedFeeRappen: 100, observedFeeRappen: null });
    expect(v.kind).toBe("missing");
    expect(v.pass).toBe(false);
    expect(v.message).toMatch(/silent-loss/i);
  });

  it("treats an explicit zero fee the same as no fee at all", () => {
    // Stripe can report 0 rather than omitting the fee; both mean "we took
    // nothing", and neither should be mistaken for success.
    const v = verdictFor({ expectedFeeRappen: 100, observedFeeRappen: 0 });
    expect(v.kind).toBe("missing");
    expect(v.pass).toBe(false);
  });

  it("FAILS when a Pro order was charged anyway", () => {
    const v = verdictFor({ expectedFeeRappen: 0, observedFeeRappen: 25 });
    expect(v.kind).toBe("overcharged");
    expect(v.pass).toBe(false);
    expect(v.message).toMatch(/paying twice/i);
  });

  it("checks overcharging before the no-fee-expected happy path", () => {
    // Order matters: a naive `if (want === 0) return pass` would report a Pro
    // tenant being billed as a clean run.
    expect(
      verdictFor({ expectedFeeRappen: 0, observedFeeRappen: 1 }).pass,
    ).toBe(false);
  });

  it("FAILS on a wrong amount and says the relationship is not the problem", () => {
    const v = verdictFor({ expectedFeeRappen: 100, observedFeeRappen: 137 });
    expect(v.kind).toBe("mismatch");
    expect(v.pass).toBe(false);
    expect(v.message).toContain("CHF 1.00");
    expect(v.message).toContain("CHF 1.37");
  });

  it("distinguishes a rejection we recognise from one we don't", () => {
    const recognised = verdictFor({
      expectedFeeRappen: 100,
      observedFeeRappen: null,
      rejected: true,
      rejectionRecognised: true,
    });
    expect(recognised.kind).toBe("rejected");
    expect(recognised.pass).toBe(false);
    // Recognised means the retry fires, so the vendor still gets paid.
    expect(recognised.message).toMatch(/sale would still complete/i);

    const unrecognised = verdictFor({
      expectedFeeRappen: 100,
      observedFeeRappen: null,
      rejected: true,
      rejectionRecognised: false,
    });
    expect(unrecognised.kind).toBe("rejected");
    expect(unrecognised.message).toMatch(/worse case/i);
    expect(unrecognised.message).toMatch(/storefront down/i);
  });

  it("reports a rejection as rejected, not as a missing fee", () => {
    // Both have observedFeeRappen null; conflating them would send someone
    // hunting the retry logic when Stripe never accepted the call at all.
    const v = verdictFor({
      expectedFeeRappen: 100,
      observedFeeRappen: null,
      rejected: true,
    });
    expect(v.kind).toBe("rejected");
  });
});

describe("summarise", () => {
  const pass = {
    label: "free",
    verdict: verdictFor({ expectedFeeRappen: 100, observedFeeRappen: 100 }),
  };
  const fail = {
    label: "pro",
    verdict: verdictFor({ expectedFeeRappen: 0, observedFeeRappen: 25 }),
  };

  it("passes only when every case passed", () => {
    expect(summarise([pass]).pass).toBe(true);
    expect(summarise([pass, fail]).pass).toBe(false);
    expect(summarise([pass, fail]).failed).toEqual(["pro"]);
  });

  it("does not report an empty run as a pass", () => {
    // A run that tested nothing — every case skipped — must not read as green.
    // This is how the Connect suite once "passed" while silently skipping.
    expect(summarise([]).pass).toBe(false);
  });
});

describe("the fee the verifier checks is the fee checkout charges", () => {
  it("uses the real pricing code, not a copy of the numbers", () => {
    // If these drift, the verification proves something other than what
    // production does — so the script computes its expectation with the same
    // function checkoutSession.ts calls.
    const subtotal = 10_000; // CHF 100.00
    expect(platformFeeRappen({ plan: "free" }, subtotal)).toBe(100); // 1%
    expect(platformFeeRappen({ plan: "pro" }, subtotal)).toBe(0);

    const free = verdictFor({
      expectedFeeRappen: platformFeeRappen({ plan: "free" }, subtotal),
      observedFeeRappen: 100,
    });
    expect(free.pass).toBe(true);

    const pro = verdictFor({
      expectedFeeRappen: platformFeeRappen({ plan: "pro" }, subtotal),
      observedFeeRappen: null,
    });
    expect(pro.pass).toBe(true);
  });
});
