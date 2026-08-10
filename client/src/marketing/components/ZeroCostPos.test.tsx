import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ZERO_COST_POS, FREE_PLAN, POSITIONING } from "@shared/platform";
import { ZeroCostPos } from "./ZeroCostPos";

afterEach(cleanup);

function renderBand() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <ZeroCostPos />
    </Router>,
  );
}

describe("ZeroCostPos", () => {
  it("leads with the claim", () => {
    renderBand();
    // The heading carries the whole sentence even though the underline only
    // hugs the second half.
    expect(
      screen.getByRole("heading", {
        name: `${ZERO_COST_POS.headline} ${ZERO_COST_POS.headlineEmphasis}`,
      }),
    ).toBeTruthy();
  });

  it("renders the price from the plan rather than a typed-in figure", () => {
    renderBand();
    // If the Free plan ever stopped being CHF 0, this band would have to change
    // with it instead of quietly continuing to advertise free.
    expect(FREE_PLAN.priceChf).toBe(0);
    expect(screen.getByTestId("zero-cost-price").textContent).toContain(
      "CHF 0",
    );
  });

  it("lists everything the claim promises", () => {
    renderBand();
    for (const item of ZERO_COST_POS.includes) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });

  it("states the catch up front instead of burying it", () => {
    renderBand();
    expect(screen.getByText(ZERO_COST_POS.catch)).toBeTruthy();
  });

  it("routes to signup", () => {
    renderBand();
    expect(
      screen.getByRole("link", { name: /start free/i }).getAttribute("href"),
    ).toBe("/signup");
  });

  it("names no competitor and asserts nobody else's price", () => {
    // The band is specific about what Zolto ships; the contrast is the
    // comparison table's job. An unverifiable "nobody else does this" here
    // would undercut the honesty the rest of the page is selling.
    const { container } = renderBand();
    const text = container.textContent ?? "";
    for (const incumbent of POSITIONING.incumbents) {
      expect(text).not.toContain(incumbent);
    }
    expect(text).not.toMatch(/shopify/i);
    expect(text).not.toMatch(/no (other )?competitor|nobody else/i);
  });

  // `dense` is the homepage-reel rendering: the chapter owns the band, the
  // gutter and the vertical rhythm. It is padding and framing only — a variant
  // that quietly dropped content would make the reel a content cut.
  it("becomes a mahogany panel, with the price and every included line intact", () => {
    const { hook } = memoryLocation({ path: "/", static: true });
    const { container } = render(
      <Router hook={hook}>
        <ZeroCostPos dense />
      </Router>,
    );
    expect(container.querySelector("section")).toBeNull();
    // The statement keeps its mahogany — as a panel rather than a full band.
    expect(screen.getByTestId("zero-cost-pos").className).toContain(
      "bg-[var(--brand-ink)]",
    );
    expect(screen.getByTestId("zero-cost-price").textContent).toContain("CHF");
    for (const item of ZERO_COST_POS.includes) {
      expect(screen.getByText(item)).toBeTruthy();
    }
  });
});
