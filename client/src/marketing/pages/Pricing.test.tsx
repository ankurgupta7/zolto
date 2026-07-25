import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Pricing from "./Pricing";

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
  it("shows the four plans with a free tier", () => {
    renderPricing();
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Maker" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Studio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Atelier" })).toBeTruthy();
  });

  it("keeps the Free plan a complete store, not a capped demo", () => {
    renderPricing();
    // Zero-cost features live on Free…
    expect(screen.getByText(/Unlimited products/i)).toBeTruthy();
    expect(screen.getByText(/One-click full data export/i)).toBeTruthy();
    // …and the retired manufactured caps are gone.
    expect(screen.queryByText(/Up to 50 products/i)).toBeNull();
    expect(screen.queryByText(/10 AI descriptions/i)).toBeNull();
  });

  it("surfaces AI photo generation as a metered add-on, not 'unlimited'", () => {
    renderPricing();
    expect(
      screen.getByRole("heading", { name: /AI Photo Credits/i }),
    ).toBeTruthy();
    expect(screen.getAllByText(/per image/i).length).toBeGreaterThan(0);
    // The dishonest "unlimited AI" line must not appear anywhere on the page.
    expect(screen.queryByText(/unlimited ai/i)).toBeNull();
  });

  it("carries the pricing pledge", () => {
    renderPricing();
    expect(screen.getAllByText(/never charge/i).length).toBeGreaterThan(0);
  });
});
