import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SOVEREIGNTY, sovereigntyByState } from "@shared/platform";
import { SwissMade } from "./SwissMade";

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
  it("leads with where Zolto is from", () => {
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
});
