import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { SOVEREIGNTY } from "@shared/platform";
import Landing from "./Landing";

afterEach(cleanup);

function renderLanding() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <Landing />
    </Router>,
  );
}

describe("Landing", () => {
  it("leads with the AI-native thesis", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Your next customer is an AI/i,
      }),
    ).toBeTruthy();
  });

  it("proves the thesis: an agent purchase and the found→asked→bought loop", () => {
    renderLanding();
    // The proof band stages a real MCP purchase…
    expect(screen.getByText(/Order placed/i)).toBeTruthy();
    expect(screen.getByText(/bergblume\.zolto\.ch\/mcp/i)).toBeTruthy();
    // …and the mechanics band explains the loop.
    expect(
      screen.getByRole("heading", { name: /How an AI buys from you/i }),
    ).toBeTruthy();
  });

  it("shows the product visually (channels + photo→listing)", () => {
    renderLanding();
    expect(screen.getByText("Market stall")).toBeTruthy();
    expect(screen.getByText("Web storefront")).toBeTruthy();
    expect(screen.getByText("Moonstone Pendant Necklace")).toBeTruthy();
  });

  it("makes the disruption case without claiming to be the cheapest", () => {
    renderLanding();
    // The comparison intro used to open on "a card reader was basically a
    // status symbol — you're still paying for that era", which stopped being
    // true when SumUp and Worldline both shipped softPOS. It now concedes the
    // card rate in its first breath, because the table underneath does too.
    expect(screen.getByText(/two of them beat us/i)).toBeTruthy();
    // …and the pricing pledge (free in person; fee only online).
    expect(
      screen.getAllByText(/selling in person is free/i).length,
    ).toBeGreaterThan(0);
  });

  it("leads the in-person argument with the squeeze play", () => {
    renderLanding();
    expect(screen.getByTestId("squeeze-play")).toBeTruthy();
    expect(screen.getAllByTestId(/^squeeze-panel-/).length).toBe(3);
  });

  it("shows the scan → tap → reconcile selling loop", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", { name: /Scan your notebook/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /Confirm at day.s end/i }),
    ).toBeTruthy();
  });

  it("puts the Swiss claim above the fold and the ledger on the page", () => {
    renderLanding();
    // Hero badges: where we're from, before anyone scrolls.
    for (const badge of SOVEREIGNTY.heroBadges) {
      expect(screen.getByText(badge)).toBeTruthy();
    }
    expect(
      screen.getByRole("heading", {
        name: `${SOVEREIGNTY.headline} ${SOVEREIGNTY.headlineEmphasis}`,
      }),
    ).toBeTruthy();
    // Every row, including the ones still outside Europe.
    for (const entry of SOVEREIGNTY.ledger) {
      expect(screen.getByText(entry.piece)).toBeTruthy();
    }
    expect(
      screen.getByRole("link", { name: /moving next/i }).getAttribute("href"),
    ).toBe(SOVEREIGNTY.href);
  });

  it("offers the primary and secondary calls to action", () => {
    renderLanding();
    // Two signup CTAs (hero + closing band) both point at /signup.
    const signupLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/signup");
    expect(signupLinks.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("link", { name: /see pricing/i }).getAttribute("href"),
    ).toBe("/pricing");
  });
});
