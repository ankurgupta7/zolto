import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  ZERO_COST_POS,
  FREE_PLAN,
  POSITIONING,
  formatPrice,
} from "@shared/platform";
import { ZeroCostPos, ZeroCostPosClaim, ZeroCostPosPrice } from "./ZeroCostPos";

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

  // The band splits in two for the homepage reel, which snaps one screen at a
  // time: the claim is a screen and the price is a screen. Each half carries
  // its own mahogany, so the statement keeps its ground on a light chapter.
  it("splits into a claim and a price, each keeping the mahogany", () => {
    const { hook } = memoryLocation({ path: "/", static: true });
    const { container } = render(
      <Router hook={hook}>
        <ZeroCostPosClaim dense />
        <ZeroCostPosPrice dense />
      </Router>,
    );
    expect(container.querySelector("section")).toBeNull();
    // The statement keeps its mahogany — as a panel rather than a full band.
    expect(screen.getByTestId("zero-cost-pos").className).toContain(
      "bg-[var(--brand-ink)]",
    );
    expect(screen.getByTestId("zero-cost-price").textContent).toContain("CHF");
  });

  it("arrives at CHF 0 as a total rather than asserting it", () => {
    // "Free forever" is a claim, and a claim invites the reader to hunt for
    // the catch. An itemised statement lets them hunt and find nothing.
    const { hook } = memoryLocation({ path: "/", static: true });
    render(
      <Router hook={hook}>
        <ZeroCostPosPrice dense />
      </Router>,
    );
    const receipt = screen.getByTestId("free-plan-receipt");
    const zero = formatPrice(FREE_PLAN.priceChf);
    for (const line of ZERO_COST_POS.receipt.lines) {
      expect(within(receipt).getByText(line)).toBeTruthy();
    }
    // One figure per line, plus the total — every one of them zero.
    const figures = within(receipt).getAllByText(zero);
    expect(figures.length).toBe(ZERO_COST_POS.receipt.lines.length + 1);
    expect(screen.getByTestId("zero-cost-price").textContent).toContain(zero);
  });

  it("prices exactly the things the free plan includes, no more", () => {
    // `lines` is `includes` at receipt length. If the two drift, the drawing
    // starts promising a tier the plan doesn't have — the one failure this
    // band cannot survive, and the reason `includes` is pinned to FREE_PLAN.
    expect(ZERO_COST_POS.receipt.lines.length).toBe(
      ZERO_COST_POS.includes.length,
    );
  });

  it("does not say in the claim what the ticklist beside it already says", () => {
    // `body`'s first half is the `includes` list in prose. On the reel both
    // halves are on one screen, so the long form was saying photos-names-
    // prices-and-it-syncs twice in the space of a glance.
    const { hook } = memoryLocation({ path: "/", static: true });
    render(
      <Router hook={hook}>
        <ZeroCostPosClaim dense />
      </Router>,
    );
    expect(screen.getByText(ZERO_COST_POS.bodyShort)).toBeTruthy();
    expect(screen.queryByText(ZERO_COST_POS.body)).toBeNull();
  });

  it("sends the processor-rate catch to /pricing rather than printing it", () => {
    // The catch's second sentence was the longest block on the homepage, and
    // /pricing makes the same point at length as PRICING_PROMISE.points[4].
    // Dropping it silently would be the one edit this band can't survive — so
    // the link has to be there, and has to go somewhere that says it.
    const { hook } = memoryLocation({ path: "/", static: true });
    render(
      <Router hook={hook}>
        <ZeroCostPosClaim dense />
      </Router>,
    );
    expect(screen.queryByText(ZERO_COST_POS.catch)).toBeNull();
    const link = screen.getByRole("link", {
      name: new RegExp(ZERO_COST_POS.processorNoteLink.slice(0, 24), "i"),
    });
    expect(link.getAttribute("href")).toBe("/pricing");
  });
});
