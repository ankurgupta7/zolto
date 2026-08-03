// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Privacy, Terms } from "./Legal";

afterEach(cleanup);

describe("marketing Privacy page", () => {
  it("discloses the session cookie and cookieless Umami analytics", () => {
    render(<Privacy />);

    expect(
      screen.getByRole("heading", { name: /cookies & analytics/i }),
    ).toBeTruthy();
    // The only cookie the platform sets, named so a reader can find it.
    expect(screen.getByText(/app_session_id/)).toBeTruthy();
    // Analytics disclosure: the tool is named and its cookieless nature stated.
    expect(screen.getByText(/Umami/)).toBeTruthy();
    expect(screen.getByText(/without cookies/)).toBeTruthy();
    // First-party fonts are part of the "no third-party requests" claim.
    expect(screen.getByText(/third-party font networks/)).toBeTruthy();
  });

  it("keeps the section numbering sequential after the insertion", () => {
    render(<Privacy />);
    const numbers = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => Number(h.textContent?.match(/^(\d+)\./)?.[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("marketing Terms page", () => {
  it("still renders its sections", () => {
    render(<Terms />);
    expect(
      screen.getByRole("heading", { name: /subscriptions & trials/i }),
    ).toBeTruthy();
  });
});
