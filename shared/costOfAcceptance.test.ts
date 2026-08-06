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
    ["zolto-twint-qr", 0.59, 1.3],
    ["sumup-payments-plus", 0.45, 0.99],
    ["sumup-debit", 0.68, 1.5],
    ["worldline-tap-on-mobile", 0.77, 1.7],
    ["zolto-card-eea", 0.83, 1.84],
    ["sumup-credit", 1.13, 2.5],
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

  it("does NOT put Zolto at the top of the in-person table", () => {
    // The finding, pinned. On raw card rate Zolto loses to SumUp Payments Plus
    // and to Worldline Tap on Mobile. A table that reordered itself until Zolto
    // won would be the exact behaviour the pricing pledge is positioned against,
    // so this test fails loudly if anyone ever "fixes" the ordering.
    const rows = basketTable(BASKET_EXAMPLE_CHF, "in-person");
    const zoltoCard = rows.findIndex((r) => r.rate.id === "zolto-card-eea");
    const sumUpPlus = rows.findIndex(
      (r) => r.rate.id === "sumup-payments-plus",
    );
    const worldline = rows.findIndex(
      (r) => r.rate.id === "worldline-tap-on-mobile",
    );
    expect(sumUpPlus).toBeLessThan(zoltoCard);
    expect(worldline).toBeLessThan(zoltoCard);
  });

  it("keeps SumUp cheaper than Zolto online on every plan", () => {
    // The other unflattering finding: online is where Zolto is most expensive
    // of the three on rate. Its argument there is what the store does, not what
    // the transaction costs — and the page has to be able to say so.
    const rows = basketTable(BASKET_EXAMPLE_CHF, "online");
    const byId = new Map(rows.map((r) => [r.rate.id, r.totalChf]));
    expect(byId.get("sumup-online")!).toBeLessThan(
      byId.get("zolto-online-pro")!,
    );
    expect(byId.get("zolto-online-pro")!).toBeLessThan(
      byId.get("zolto-online-free")!,
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
  it("separates what the payment company takes from what Zolto adds", () => {
    const free = costOfBasket(100, rate("zolto-online-free"));
    // Stripe 2.9% + CHF 0.30, then Zolto's 1% on top — shown as two numbers
    // because "1%" on its own was the claim that read as a total.
    expect(free.acquirerChf).toBe(3.2);
    expect(free.platformChf).toBe(1);
    expect(free.totalChf).toBe(4.2);
  });

  it("sources Zolto's platform slice from REVENUE_SHARE, never a literal", () => {
    expect(rate("zolto-online-free").platformPercent).toBe(
      REVENUE_SHARE.freeBps / 100,
    );
    expect(rate("zolto-online-pro").platformPercent).toBe(
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
    for (const r of RATES.filter((r) => r.provider !== "zolto")) {
      expect(r.platformPercent).toBe(0);
    }
  });
});

describe("costOfBasket", () => {
  it("treats a zero, negative or non-finite basket as a zero month", () => {
    for (const bad of [0, -10, NaN, Infinity]) {
      const cost = costOfBasket(bad, rate("zolto-online-free"));
      expect(cost.totalChf).toBe(0);
      expect(cost.effectivePct).toBe(0);
    }
  });

  it("does not charge a fixed fee on a sale that didn't happen", () => {
    expect(costOfBasket(0, rate("zolto-card-eea")).totalChf).toBe(0);
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

  it("marks both Swiss-card readings unverified rather than picking one", () => {
    // The single biggest uncertainty in the whole comparison: it moves Zolto's
    // in-person row by more than a percentage point. Publishing one silently
    // would be choosing a number rather than reporting one.
    expect(rate("zolto-card-eea").confidence).toBe("unverified");
    expect(rate("zolto-card-non-eea").confidence).toBe("unverified");
    expect(rate("zolto-card-non-eea").percent).toBeGreaterThan(
      rate("zolto-card-eea").percent + 1,
    );
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
    expect(negotiatedFor("zolto")).toEqual([]);
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
    // Zolto:  1% of 2000 = 20.00.  Subscription: 0.
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
    // The point of the whole exercise: Zolto's 1% was being read as the cost
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
    expect(ratesFor("zolto").length).toBeGreaterThan(0);
  });

  it("computes SumUp Plus's break-even against its own pay-as-you-go rates", () => {
    // The review's "roughly CHF 1,900/month credit-heavy, CHF 5,700 debit-heavy".
    // Computed, so it moves if any of the three rates do.
    expect(sumUpPlusBreakEvenChf("sumup-credit")).toBe(1900);
    expect(sumUpPlusBreakEvenChf("sumup-debit")).toBe(5700);
  });
});
