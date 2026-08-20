import { BRAND } from "./brand";
import { describe, it, expect } from "vitest";
import {
  RATES,
  NEGOTIATED,
  BASKET_EXAMPLE_CHF,
  costOfBasket,
  basketTable,
  rate,
  ratesFor,
  negotiatedFor,
  sumUpPlusBreakEvenChf,
  monthlyStack,
} from "./costOfAcceptance";
import { REVENUE_SHARE } from "./platform";

describe("the CHF 45 basket", () => {
  it("uses the review's worked example as its default", () => {
    expect(BASKET_EXAMPLE_CHF).toBe(45);
  });

  /**
   * These six figures are the review's table, reproduced exactly. They are the
   * reason this module exists, so they are pinned rather than recomputed: if a
   * rate is edited, this test says so instead of the page quietly changing its
   * mind about what a sale costs.
   */
  it.each([
    ["platform-twint-qr", 0.59, 1.3],
    ["sumup-payments-plus", 0.45, 0.99],
    ["sumup-debit", 0.68, 1.5],
    ["worldline-tap-on-mobile", 0.77, 1.7],
    ["sumup-credit", 1.13, 2.5],
    ["platform-card", 1.51, 3.34],
  ])("costs %s CHF %s (%s%%)", (id, chf, pct) => {
    const cost = costOfBasket(BASKET_EXAMPLE_CHF, rate(id));
    expect(cost.totalChf).toBe(chf);
    expect(cost.effectivePct).toBe(pct);
  });
});

describe("basketTable", () => {
  it("sorts cheapest first", () => {
    const rows = basketTable();
    const totals = rows.map((r) => r.totalChf);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });

  it(`puts ${BRAND.name}'s card row LAST in person, because that is where it belongs`, () => {
    // The finding, pinned, and sharper since Stripe confirmed Swiss cards bill
    // at the non-EEA rate: taking a card through Gwinn is the most expensive
    // in-person option on our own comparison. A table that reordered itself
    // until Gwinn won would be the exact behaviour the pricing pledge is
    // positioned against, so this fails loudly if anyone ever "fixes" it.
    const rows = basketTable(BASKET_EXAMPLE_CHF, "in-person");
    expect(rows.at(-1)!.rate.id).toBe("platform-card");
  });

  it("puts TWINT second overall, and first among options with no monthly fee", () => {
    // The other half of the same fact, and the reason the in-person argument
    // survives: the cheapest row (SumUp Payments Plus) costs CHF 29/month to
    // stand on. TWINT costs nothing to stand on and is next.
    const rows = basketTable(BASKET_EXAMPLE_CHF, "in-person");
    expect(rows[1].rate.id).toBe("platform-twint-qr");
    const noSubscription = rows.filter((r) => r.rate.monthlyChf === 0);
    expect(noSubscription[0].rate.id).toBe("platform-twint-qr");
  });

  it("keeps TWINT under half the cost of a card, which the copy claims", () => {
    // SOVEREIGNTY and BUYER_FIT both say "less than half what the same sale
    // costs on a card". That is arithmetic, so it gets checked here rather
    // than trusted in four languages.
    const twint = costOfBasket(BASKET_EXAMPLE_CHF, rate("platform-twint-qr"));
    const card = costOfBasket(BASKET_EXAMPLE_CHF, rate("platform-card"));
    expect(twint.totalChf).toBeLessThan(card.totalChf / 2);
  });

  it(`keeps SumUp cheaper than ${BRAND.name} online on every plan`, () => {
    // The other unflattering finding: online is where Gwinn is most expensive
    // of the three on rate. Its argument there is what the store does, not what
    // the transaction costs — and the page has to be able to say so.
    const rows = basketTable(BASKET_EXAMPLE_CHF, "online");
    const byId = new Map(rows.map((r) => [r.rate.id, r.totalChf]));
    expect(byId.get("sumup-online")!).toBeLessThan(
      byId.get("platform-online-pro")!,
    );
    expect(byId.get("platform-online-pro")!).toBeLessThan(
      byId.get("platform-online-free")!,
    );
  });

  it("filters by channel", () => {
    expect(
      basketTable(BASKET_EXAMPLE_CHF, "online").every(
        (r) => r.rate.channel === "online",
      ),
    ).toBe(true);
    expect(basketTable(BASKET_EXAMPLE_CHF).length).toBe(RATES.length);
  });
});

describe("the fee stack is split, not summed away", () => {
  it(`separates what the payment company takes from what ${BRAND.name} adds`, () => {
    const free = costOfBasket(100, rate("platform-online-free"));
    // Stripe 2.9% + CHF 0.30, then Gwinn's 1% on top — shown as two numbers
    // because "1%" on its own was the claim that read as a total.
    expect(free.acquirerChf).toBe(3.2);
    expect(free.platformChf).toBe(1);
    expect(free.totalChf).toBe(4.2);
  });

  it(`sources ${BRAND.name}'s platform slice from REVENUE_SHARE, never a literal`, () => {
    expect(rate("platform-online-free").platformPercent).toBe(
      REVENUE_SHARE.freeBps / 100,
    );
    expect(rate("platform-online-pro").platformPercent).toBe(
      REVENUE_SHARE.proBps / 100,
    );
  });

  it("adds nothing to any in-person rate, on any plan", () => {
    for (const r of RATES.filter((r) => r.channel === "in-person")) {
      expect(r.platformPercent).toBe(0);
    }
    expect(REVENUE_SHARE.inPersonBps).toBe(0);
  });

  it("charges no platform fee to a competitor's rate", () => {
    for (const r of RATES.filter((r) => r.provider !== "platform")) {
      expect(r.platformPercent).toBe(0);
    }
  });
});

describe("costOfBasket", () => {
  it("treats a zero, negative or non-finite basket as a zero month", () => {
    for (const bad of [0, -10, NaN, Infinity]) {
      const cost = costOfBasket(bad, rate("platform-online-free"));
      expect(cost.totalChf).toBe(0);
      expect(cost.effectivePct).toBe(0);
    }
  });

  it("does not charge a fixed fee on a sale that didn't happen", () => {
    expect(costOfBasket(0, rate("platform-card")).totalChf).toBe(0);
  });

  it("rounds to whole cents rather than leaking float noise", () => {
    const cost = costOfBasket(33.33, rate("sumup-credit"));
    expect(cost.totalChf).toBe(0.83);
    expect(Number.isInteger(cost.totalChf * 100)).toBe(true);
  });
});

describe("honesty invariants", () => {
  it("gives every unverified rate a caveat explaining what's unknown", () => {
    for (const r of RATES.filter((r) => r.confidence === "unverified")) {
      expect(r.caveat, `${r.id} is unverified but has no caveat`).toBeTruthy();
    }
  });

  it("publishes one confirmed Swiss card rate, not two hopeful ones", () => {
    // This shipped as two `unverified` rows — an optimistic 1.4% and a
    // pessimistic 2.9% — for exactly as long as it took to get an answer out
    // of Stripe, because guessing would have been choosing a number rather
    // than reporting one. Stripe confirmed the pessimistic reading in August
    // 2026, so the optimistic row is gone rather than kept as a hopeful
    // footnote, and the surviving row is marked verified.
    const card = rate("platform-card");
    expect(card.confidence).toBe("verified");
    expect(card.percent).toBe(2.9);
    expect(RATES.filter((r) => /platform-card/.test(r.id))).toHaveLength(1);
    // The row still explains itself: Gwinn adds nothing, and TWINT is cheaper.
    expect(card.caveat).toMatch(/non-EEA/);
    expect(card.caveat).toMatch(/TWINT/);
  });

  it("keeps the unverified escape hatch even with nothing using it", () => {
    // No rate is currently unverified, which is the mechanism working rather
    // than dead code. Removing it would leave only "publish a guess as fact"
    // or "publish nothing" — the choice this module exists to avoid.
    const unverified = RATES.filter((r) => r.confidence === "unverified");
    expect(unverified).toHaveLength(0);
    for (const r of unverified) expect(r.caveat).toBeTruthy();
  });

  it("keeps negotiated pricing out of the quantified table", () => {
    // Worldline's terminals and Saferpay acquiring have no published rate.
    // They stay on their own list rather than getting an invented number.
    const quantifiedIds = new Set(RATES.map((r) => r.id));
    for (const n of NEGOTIATED) {
      expect(quantifiedIds.has(n.id)).toBe(false);
      expect(n.detail).toBeTruthy();
    }
    expect(negotiatedFor("worldline").length).toBeGreaterThan(0);
    expect(negotiatedFor("platform")).toEqual([]);
  });

  it("concedes Worldline's Tap on Mobile is a good offer", () => {
    // The review is explicit that the comparison should stop pretending this
    // doesn't exist. Conceding it is what makes the rest of the page credible.
    expect(rate("worldline-tap-on-mobile").caveat).toBeTruthy();
    expect(rate("worldline-tap-on-mobile").monthlyChf).toBe(0);
  });

  it("gives every rate a unique id and a source", () => {
    const ids = RATES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RATES) expect(r.sourceId).toBeTruthy();
  });
});

describe("monthlyStack", () => {
  it("names every party that takes a cut of a month's online selling", () => {
    // CHF 2,000 across CHF 50 baskets = 40 orders.
    // Stripe: 2.9% of 2000 = 58.00, plus 40 × 0.30 = 12.00 → 70.00
    // Gwinn:  1% of 2000 = 20.00.  Subscription: 0.
    const s = monthlyStack(2000, 50, "free");
    expect(s.orders).toBe(40);
    expect(s.processorChf).toBe(70);
    expect(s.platformChf).toBe(20);
    expect(s.subscriptionChf).toBe(0);
    expect(s.totalChf).toBe(90);
    expect(s.keepChf).toBe(1910);
    expect(s.effectivePct).toBe(4.5);
  });

  it("shows Pro trading the platform fee for a subscription", () => {
    const s = monthlyStack(2000, 50, "pro");
    expect(s.platformChf).toBe(0);
    expect(s.subscriptionChf).toBe(25);
    expect(s.processorChf).toBe(70);
    expect(s.totalChf).toBe(95);
  });

  it("makes the processor the larger cut at every volume", () => {
    // The point of the whole exercise: Gwinn's 1% was being read as the cost
    // of a sale while Stripe was quietly taking three times as much.
    for (const sales of [200, 1000, 2500, 6000]) {
      const s = monthlyStack(sales, 45, "free");
      expect(s.processorChf).toBeGreaterThan(s.platformChf);
    }
  });

  it("still bills Pro's subscription in a month with no sales", () => {
    expect(monthlyStack(0, 45, "pro").totalChf).toBe(25);
    expect(monthlyStack(0, 45, "free").totalChf).toBe(0);
  });

  it("requires a basket rather than assuming one, but survives a bad input", () => {
    // Stripe's fixed CHF 0.30 can't be spread over a month without an order
    // count. Falling back to the worked example beats dividing by zero.
    expect(monthlyStack(900, 0, "free").orders).toBe(20); // 900 / 45
    expect(monthlyStack(900, NaN, "free").orders).toBe(20);
  });

  it("never reports a fraction of an order", () => {
    for (const [sales, avg] of [
      [100, 33],
      [7, 45],
      [1234, 56],
    ]) {
      expect(Number.isInteger(monthlyStack(sales, avg, "free").orders)).toBe(
        true,
      );
    }
  });

  it("treats a negative or non-finite month as a zero month", () => {
    for (const bad of [-100, NaN, Infinity]) {
      const s = monthlyStack(bad, 45, "free");
      expect(s.salesChf).toBe(0);
      expect(s.orders).toBe(0);
      expect(s.processorChf).toBe(0);
    }
  });
});

describe("helpers", () => {
  it("throws on an unknown rate id", () => {
    expect(() => rate("nope")).toThrow(/Unknown rate id/);
  });

  it("groups rates by provider", () => {
    expect(ratesFor("sumup").every((r) => r.provider === "sumup")).toBe(true);
    expect(ratesFor("platform").length).toBeGreaterThan(0);
  });

  it("computes SumUp Plus's break-even against its own pay-as-you-go rates", () => {
    // The review's "roughly CHF 1,900/month credit-heavy, CHF 5,700 debit-heavy".
    // Computed, so it moves if any of the three rates do.
    expect(sumUpPlusBreakEvenChf("sumup-credit")).toBe(1900);
    expect(sumUpPlusBreakEvenChf("sumup-debit")).toBe(5700);
  });
});
