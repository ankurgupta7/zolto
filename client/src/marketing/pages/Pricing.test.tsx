import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Pricing from "./Pricing";
import { PRO_PLAN, REVENUE_SHARE } from "@shared/platform";

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
    expect(
      screen.getAllByText(/Zolto adds nothing/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/CHF 0/).length).toBeGreaterThan(0);
    // Break-even upsell number is on the page.
    expect(screen.getAllByText(/2,500/).length).toBeGreaterThan(0);
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
});
