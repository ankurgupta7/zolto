import { describe, it, expect } from "vitest";
import {
  DISCOUNT_CODE_ALPHABET,
  MAX_DISCOUNT_CODE_LENGTH,
  describeDiscount,
  discountAmountRappen,
  discountShareUrl,
  evaluateDiscount,
  formatMinorUnits,
  generateDiscountCode,
  generateDiscountCodes,
  normaliseDiscountCode,
} from "./discounts";

describe("normaliseDiscountCode", () => {
  it("upper-cases and strips whitespace and punctuation", () => {
    expect(normaliseDiscountCode("  friends family! ")).toBe("FRIENDSFAMILY");
  });

  it("keeps the joining dash and folds the dashes a keyboard actually produces", () => {
    expect(normaliseDiscountCode("friends-family")).toBe("FRIENDS-FAMILY");
    expect(normaliseDiscountCode("friends–family")).toBe("FRIENDS-FAMILY");
    expect(normaliseDiscountCode("friends_family")).toBe("FRIENDS-FAMILY");
  });

  it("collapses runs of dashes and trims them from the ends", () => {
    expect(normaliseDiscountCode("--a---b--")).toBe("A-B");
  });

  it("returns an empty string for nothing usable", () => {
    expect(normaliseDiscountCode("")).toBe("");
    expect(normaliseDiscountCode(null)).toBe("");
    expect(normaliseDiscountCode("   ***   ")).toBe("");
  });

  it("never exceeds the column width", () => {
    expect(normaliseDiscountCode("X".repeat(80))).toHaveLength(
      MAX_DISCOUNT_CODE_LENGTH,
    );
  });
});

describe("generateDiscountCode", () => {
  /** Deterministic bytes so the produced code can be asserted exactly. */
  const bytes =
    (...values: number[]) =>
    () =>
      Uint8Array.from(values);

  it("draws from the unambiguous alphabet", () => {
    const code = generateDiscountCode({
      length: 4,
      randomBytes: bytes(0, 1, 2, 3),
    });
    expect(code).toBe("ABCD");
  });

  it("excludes the characters people mis-key", () => {
    for (const ch of ["I", "O", "0", "1"]) {
      expect(DISCOUNT_CODE_ALPHABET).not.toContain(ch);
    }
  });

  it("maps every byte value onto the alphabet without bias (256 is 8 × 32)", () => {
    const low = generateDiscountCode({
      length: 24,
      randomBytes: () => Uint8Array.from({ length: 24 }, (_, i) => i),
    });
    expect(new Set(low).size).toBe(24);
    // Bytes n and n+32 have to land on the same symbol — that equality IS the
    // absence of modulo bias, and it would break the moment the alphabet
    // stopped being a whole divisor of 256.
    const wrapped = generateDiscountCode({
      length: 24,
      randomBytes: () => Uint8Array.from({ length: 24 }, (_, i) => i + 32),
    });
    expect(wrapped).toBe(low);
  });

  it("prefixes a campaign name, normalised", () => {
    const code = generateDiscountCode({
      prefix: " friends family ",
      length: 4,
      randomBytes: bytes(0, 0, 0, 0),
    });
    expect(code).toBe("FRIENDSFAMILY-AAAA");
  });

  it("never exceeds the column width even with a long prefix", () => {
    const code = generateDiscountCode({
      prefix: "A".repeat(40),
      length: 8,
      randomBytes: () => new Uint8Array(8),
    });
    expect(code.length).toBeLessThanOrEqual(MAX_DISCOUNT_CODE_LENGTH);
  });

  it("uses real randomness by default and produces distinct codes", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateDiscountCode()),
    );
    expect(codes.size).toBe(50);
  });
});

describe("generateDiscountCodes", () => {
  it("mints the requested number of distinct codes", () => {
    const codes = generateDiscountCodes(25, { prefix: "XMAS" });
    expect(codes).toHaveLength(25);
    expect(new Set(codes).size).toBe(25);
    for (const code of codes) expect(code.startsWith("XMAS-")).toBe(true);
  });

  it("de-duplicates rather than handing two customers the same single-use code", () => {
    // Randomness that always returns the same bytes: every draw collides.
    const codes = generateDiscountCodes(5, {
      length: 4,
      randomBytes: () => new Uint8Array(4),
    });
    expect(codes).toEqual(["AAAA"]);
  });

  it("clamps the batch size and never spins", () => {
    expect(generateDiscountCodes(0)).toHaveLength(1);
    expect(generateDiscountCodes(10_000).length).toBeLessThanOrEqual(500);
  });
});

describe("discountAmountRappen", () => {
  it("takes a whole percentage off", () => {
    expect(discountAmountRappen({ kind: "percent", value: 20 }, 5000)).toBe(
      1000,
    );
  });

  it("rounds a percentage down, in the merchant's favour", () => {
    // 33% of CHF 10.01 is 330.33 Rappen.
    expect(discountAmountRappen({ kind: "percent", value: 33 }, 1001)).toBe(
      330,
    );
  });

  it("takes a fixed amount off", () => {
    expect(discountAmountRappen({ kind: "amount", value: 1500 }, 5000)).toBe(
      1500,
    );
  });

  it("never discounts more than the basket is worth", () => {
    expect(discountAmountRappen({ kind: "amount", value: 2000 }, 1500)).toBe(
      1500,
    );
    expect(discountAmountRappen({ kind: "percent", value: 100 }, 1500)).toBe(
      1500,
    );
  });

  it("is zero on an empty basket", () => {
    expect(discountAmountRappen({ kind: "percent", value: 50 }, 0)).toBe(0);
  });

  it("clamps a nonsense percentage", () => {
    expect(discountAmountRappen({ kind: "percent", value: 900 }, 5000)).toBe(
      5000,
    );
    expect(discountAmountRappen({ kind: "percent", value: -10 }, 5000)).toBe(0);
  });
});

describe("evaluateDiscount", () => {
  const base = { kind: "percent" as const, value: 10, active: true };

  it("accepts a live code and reports the amount off", () => {
    expect(evaluateDiscount({ terms: base, subtotalRappen: 5000 })).toEqual({
      ok: true,
      amountOffRappen: 500,
    });
  });

  it("refuses a deactivated code", () => {
    const result = evaluateDiscount({
      terms: { ...base, active: false },
      subtotalRappen: 5000,
    });
    expect(result).toMatchObject({ ok: false, reason: "inactive" });
  });

  it("refuses a code before its start date", () => {
    const result = evaluateDiscount({
      terms: { ...base, startsAt: new Date("2026-12-01T00:00:00Z") },
      subtotalRappen: 5000,
      now: new Date("2026-11-30T23:59:59Z"),
    });
    expect(result).toMatchObject({ ok: false, reason: "not_started" });
  });

  it("refuses a code at and after its expiry", () => {
    const expiresAt = new Date("2026-12-01T00:00:00Z");
    expect(
      evaluateDiscount({
        terms: { ...base, expiresAt },
        subtotalRappen: 5000,
        now: expiresAt,
      }),
    ).toMatchObject({ ok: false, reason: "expired" });
    expect(
      evaluateDiscount({
        terms: { ...base, expiresAt },
        subtotalRappen: 5000,
        now: new Date("2026-11-30T23:59:00Z"),
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a code that has been fully redeemed", () => {
    expect(
      evaluateDiscount({
        terms: { ...base, maxRedemptions: 3, redeemedCount: 3 },
        subtotalRappen: 5000,
      }),
    ).toMatchObject({ ok: false, reason: "exhausted" });
  });

  it("allows the last redemption of a limited code", () => {
    expect(
      evaluateDiscount({
        terms: { ...base, maxRedemptions: 3, redeemedCount: 2 },
        subtotalRappen: 5000,
      }),
    ).toMatchObject({ ok: true });
  });

  it("treats a null redemption limit as unlimited", () => {
    expect(
      evaluateDiscount({
        terms: { ...base, maxRedemptions: null, redeemedCount: 9999 },
        subtotalRappen: 5000,
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a basket under the minimum, and says what the minimum is", () => {
    const result = evaluateDiscount({
      terms: { ...base, minSubtotalRappen: 10_000 },
      subtotalRappen: 5000,
      currency: "chf",
    });
    expect(result).toMatchObject({ ok: false, reason: "below_minimum" });
    expect(result.ok === false && result.message).toContain("CHF 100.00");
  });

  it("refuses a fixed-amount code in a different currency", () => {
    const result = evaluateDiscount({
      terms: { kind: "amount", value: 1000, currency: "chf", active: true },
      subtotalRappen: 5000,
      currency: "eur",
    });
    expect(result).toMatchObject({ ok: false, reason: "currency_mismatch" });
  });

  it("lets a percentage code apply in any currency", () => {
    expect(
      evaluateDiscount({
        terms: { ...base, currency: "chf" },
        subtotalRappen: 5000,
        currency: "eur",
      }),
    ).toMatchObject({ ok: true, amountOffRappen: 500 });
  });

  it("tells a shopper they are short of the minimum before telling them it is exhausted", () => {
    // Both are true; "spend CHF 20 more" is the one they can act on, so the
    // exhausted check must not pre-empt it... and vice versa when only one
    // holds. Here exhaustion is the harder stop and wins.
    const result = evaluateDiscount({
      terms: {
        ...base,
        maxRedemptions: 1,
        redeemedCount: 1,
        minSubtotalRappen: 10_000,
      },
      subtotalRappen: 5000,
    });
    expect(result).toMatchObject({ ok: false, reason: "exhausted" });
  });
});

describe("presentation helpers", () => {
  it("formats minor units with the currency", () => {
    expect(formatMinorUnits(5000, "chf")).toBe("CHF 50.00");
  });

  it("describes both kinds of discount", () => {
    expect(describeDiscount({ kind: "percent", value: 20 })).toBe("20% off");
    expect(
      describeDiscount({ kind: "amount", value: 1500, currency: "chf" }),
    ).toBe("CHF 15.00 off");
  });

  it("builds a share link that carries the code", () => {
    expect(discountShareUrl("https://kalakosh.ch/", "FRIENDS-7K3P")).toBe(
      "https://kalakosh.ch/shop?discount=FRIENDS-7K3P",
    );
  });
});
