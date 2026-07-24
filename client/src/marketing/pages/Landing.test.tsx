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
        name: /Sell online and in person/i,
      }),
    ).toBeTruthy();
  });

  it("shows the product visually (channels + photo→listing)", () => {
    renderLanding();
    expect(screen.getByText("Market stall")).toBeTruthy();
    expect(screen.getByText("Web storefront")).toBeTruthy();
    expect(screen.getByText("Moonstone Pendant Necklace")).toBeTruthy();
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
