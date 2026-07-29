import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
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
  it("leads with the maker value proposition", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Your whole shop, on the phone/i,
      }),
    ).toBeTruthy();
  });

  it("shows the product visually (channels + photo→listing)", () => {
    renderLanding();
    expect(screen.getByText("Market stall")).toBeTruthy();
    expect(screen.getByText("Web storefront")).toBeTruthy();
    expect(screen.getByText("Moonstone Pendant Necklace")).toBeTruthy();
  });

  it("makes the disruption case: names an incumbent and the pledge", () => {
    renderLanding();
    // The comparison section calls out the legacy players by name…
    expect(screen.getByText(/Stripe, SumUp and Worldline/i)).toBeTruthy();
    // …and the pricing pledge (free in person; fee only online).
    // Appears in both the pledge card and the comparison table row.
    expect(
      screen.getAllByText(/selling in person is free/i).length,
    ).toBeGreaterThan(0);
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
