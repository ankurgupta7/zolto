import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SOVEREIGNTY, sovereigntyByState } from "@shared/platform";
import {
  SwissMade,
  SwissMadeIntro,
  SwissMadeLedger,
  SovereigntyBar,
} from "./SwissMade";

afterEach(cleanup);

function renderBand() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <SwissMade />
    </Router>,
  );
}

describe("SwissMade", () => {
  it("leads with where Gwinn is from", () => {
    renderBand();
    expect(
      screen.getByRole("heading", {
        name: `${SOVEREIGNTY.headline} ${SOVEREIGNTY.headlineEmphasis}`,
      }),
    ).toBeTruthy();
    expect(screen.getByText(SOVEREIGNTY.serving)).toBeTruthy();
  });

  it("puts every ledger row on the homepage, not just the finished ones", () => {
    // The point of the band is the ledger. If the unfinished rows ever get
    // filtered out of the homepage version, this stops being a claim anyone
    // can check and becomes a badge.
    renderBand();
    for (const entry of SOVEREIGNTY.ledger) {
      expect(screen.getByText(entry.piece)).toBeTruthy();
      expect(screen.getByText(entry.today)).toBeTruthy();
    }
    expect(sovereigntyByState("moving").length).toBeGreaterThan(0);
    expect(sovereigntyByState("foreign").length).toBeGreaterThan(0);
  });

  it("labels each row's state", () => {
    const { container } = renderBand();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Moving/);
    expect(text).toMatch(/Never will be/);
  });

  it("admits what runs outside Europe today", () => {
    // The rows we'd rather not print are the ones that make the rest credible:
    // Stripe and the model provider are named on the homepage, not buried.
    const { container } = renderBand();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Stripe/);
    expect(text).toMatch(/outside Europe/i);
  });

  it("links to the full ledger", () => {
    renderBand();
    expect(
      screen.getByRole("link", { name: /moving next/i }).getAttribute("href"),
    ).toBe(SOVEREIGNTY.href);
  });

  // The band splits in two for the homepage reel, which snaps one screen at a
  // time: the intro is a screen and the ledger is a screen. Every row has to
  // survive the split, unfinished ones included — a ledger that hid those to
  // fit a viewport would be the badge this section exists not to be.
  it("keeps every ledger row across the reel's two panels", () => {
    const { hook } = memoryLocation({ path: "/", static: true });
    const { container } = render(
      <Router hook={hook}>
        <SwissMadeIntro dense />
        <SwissMadeLedger dense />
      </Router>,
    );
    expect(container.querySelector("section")).toBeNull();
    // Dense takes the one line the bar can't draw; `serving` and `body` are
    // the headline and the ledger's first row said again.
    expect(screen.getByText(SOVEREIGNTY.bodyShort)).toBeTruthy();
    expect(screen.queryByText(SOVEREIGNTY.serving)).toBeNull();
    // Every row still ships — shortened, never dropped.
    for (const entry of SOVEREIGNTY.ledger) {
      expect(screen.getByText(entry.piece)).toBeTruthy();
      expect(screen.getByText(entry.todayShort)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: /moving next/i })).toBeTruthy();
  });

  it("shows the ledger's shape before any of its rows are read", () => {
    // Counts come from the ledger, so a row flipping state moves the bar. A
    // typed-in number would go quietly wrong on exactly the day the section
    // exists to advertise.
    render(<SovereigntyBar />);
    const bar = screen.getByTestId("sovereignty-bar");
    expect(bar).toBeTruthy();
    let counted = 0;
    for (const state of ["swiss", "european", "moving", "foreign"] as const) {
      const seg = screen.queryByTestId(`sovereignty-bar-${state}`);
      const expected = SOVEREIGNTY.ledger.filter(
        (e) => e.state === state,
      ).length;
      if (expected === 0) {
        expect(seg).toBeNull();
        continue;
      }
      expect(Number(seg?.dataset.count), `${state} count`).toBe(expected);
      counted += expected;
    }
    expect(counted).toBe(SOVEREIGNTY.ledger.length);
  });

  it("names every state in the bar's accessible label", () => {
    // The bar is the only place a sighted reader gets the summary, so a
    // screen-reader user has to get the same counts from one label.
    render(<SovereigntyBar />);
    const label =
      screen
        .getByTestId("sovereignty-bar")
        .querySelector("[role=img]")
        ?.getAttribute("aria-label") ?? "";
    for (const state of ["swiss", "european", "moving", "foreign"] as const) {
      const n = SOVEREIGNTY.ledger.filter((e) => e.state === state).length;
      if (n > 0) expect(label).toContain(String(n));
    }
  });
});
