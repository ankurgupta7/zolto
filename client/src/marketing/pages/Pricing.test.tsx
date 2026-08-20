import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Pricing from "./Pricing";
import {
  PLANS,
  PRICING_PROMISE,
  PRO_BREAK_EVEN_ONLINE_CHF,
  PRO_PLAN,
  REVENUE_SHARE,
} from "@shared/platform";

afterEach(cleanup);

function renderPricing() {
  const { hook } = memoryLocation({ path: "/pricing", static: true });
  return render(
    <Router hook={hook}>
      <Pricing />
    </Router>,
  );
}

describe("Pricing", () => {
  it("shows exactly the two plans, Free and Pro", () => {
    renderPricing();
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pro" })).toBeTruthy();
    // The retired four-tier lineup must not resurface.
    expect(screen.queryByRole("heading", { name: "Maker" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Studio" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Atelier" })).toBeNull();
  });

  it("keeps the Free plan a complete store with the fee disclosed on the card", () => {
    renderPricing();
    expect(screen.getAllByText(/Full POS/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/One-click full data export/i)).toBeTruthy();
    // The fee is on the Free card itself, not buried.
    expect(
      screen.getAllByText(/1% platform fee on online & agent orders only/i)
        .length,
    ).toBeGreaterThan(0);
    // Retired manufactured caps stay gone.
    expect(screen.queryByText(/Up to 50 products/i)).toBeNull();
    expect(screen.queryByText(/10 AI descriptions/i)).toBeNull();
  });

  it("explains the fee: free in person, 1% online, Pro removes it", () => {
    renderPricing();
    expect(screen.getAllByText(/Gwinn adds nothing/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/CHF 0/).length).toBeGreaterThan(0);
    // Break-even upsell number is on the page — in Swiss formatting now
    // (en renders with the en-CH locale, not en-US).
    const breakEven = PRO_BREAK_EVEN_ONLINE_CHF.toLocaleString("en-CH");
    expect(screen.getAllByText(new RegExp(breakEven)).length).toBeGreaterThan(
      0,
    );
    // Page copy derives from the same constants checkout charges with.
    expect(REVENUE_SHARE.percentLabel).toBe("1%");
    expect(
      screen.getAllByText(new RegExp(`CHF ${PRO_PLAN.priceChf}`)).length,
    ).toBeGreaterThan(0);
  });

  it("never sells AI by the query", () => {
    renderPricing();
    // AI photo credits (CHF/image) are retired…
    expect(screen.queryByText(/photo credits/i)).toBeNull();
    expect(screen.queryByText(/per image/i)).toBeNull();
    // …and no per-query AI caps appear anywhere.
    expect(screen.queryByText(/\d+ AI descriptions/i)).toBeNull();
  });

  it("carries the pricing pledge", () => {
    renderPricing();
    expect(
      screen.getAllByText(/Selling in person is free/i).length,
    ).toBeGreaterThan(0);
  });

  it("makes each fee claim once, not once in the pledge and again below", () => {
    // The pledge box and the fee section were both stating in-person-is-free,
    // 1%-online, Pro-removes-it and AI-is-not-metered — the same four claims,
    // twice, within four screens on a phone.
    renderPricing();
    const restated =
      PRICING_PROMISE.restatedByPricingFeeSection as readonly number[];
    expect(restated.length).toBeGreaterThan(0);
    for (const i of restated) {
      const point = PRICING_PROMISE.points[i];
      expect(point, `point ${i} exists`).toBeDefined();
      expect(screen.queryByText(point)).toBeNull();
    }
    // …and the fee section still makes every one of them.
    expect(
      screen.getByText(/At the market stall, we take nothing/),
    ).toBeTruthy();
    expect(
      screen.getByText(/taken automatically inside the Stripe payment/),
    ).toBeTruthy();
    expect(screen.getByText(/kills the fee entirely/)).toBeTruthy();
    expect(screen.getByText(/AI usage is never the meter/)).toBeTruthy();
  });

  it("keeps the pledge points nothing else on the page covers", () => {
    renderPricing();
    // The processor's cut is not our fee, and the one-off CHF 20 import: the
    // fee section never mentions either, so trimming the pledge must not have
    // taken them with it.
    expect(
      screen.getByText(/What we charge is not what a sale costs/),
    ).toBeTruthy();
    expect(screen.getByText(/One thing costs extra, once/)).toBeTruthy();
  });

  it("states the cost-comparison framing once across the two channel tables", () => {
    // Both tables used to carry the same heading, the same intro and the same
    // monthly-fee footnote, which read as the page rendering twice.
    renderPricing();
    expect(screen.getAllByTestId("cost-of-acceptance")).toHaveLength(2);
    expect(screen.getAllByTestId("cost-of-acceptance-note")).toHaveLength(1);
    // "Gwinn is not at the top" is the intro's own phrase — "cheapest first"
    // also ends each table's sr-only caption, one per channel.
    expect(screen.getAllByText(/Gwinn is not at the top/i)).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: /sale costs in person/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /sale costs online/i }),
    ).toBeTruthy();
  });

  it("ships no unattributed testimonial while the release is unsigned", () => {
    renderPricing();
    // The stand-in quote was captioned "(testimonial pending release)" in the
    // live UI, which reads as an unfinished page. Nothing shows until the real,
    // released quote replaces it.
    expect(screen.queryByText(/testimonial pending release/i)).toBeNull();
    expect(screen.queryByText(/Pilot maker, Zurich/i)).toBeNull();
    expect(screen.queryByRole("blockquote")).toBeNull();
  });

  it("sends every plan CTA to signup carrying that plan", () => {
    renderPricing();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    // Derived from PLANS rather than a hard-coded list: this used to name the
    // retired four-tier ids (maker/studio/atelier), which contradicted the
    // assertion above that those tiers must not resurface, and failed once the
    // pricing pivot landed. Sourcing it from the plans keeps it true after the
    // next packaging change too.
    expect(PLANS.length).toBeGreaterThan(0);
    for (const plan of PLANS) {
      expect(hrefs).toContain(`/signup?plan=${plan.id}`);
    }
  });
});
