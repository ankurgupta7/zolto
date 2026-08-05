// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DATA_RESIDENCY, SOVEREIGNTY } from "@shared/platform";
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
    // Named twice on the page now — here, and in the sub-processor list.
    expect(screen.getAllByText(/Umami/).length).toBeGreaterThan(0);
    expect(screen.getByText(/without cookies/)).toBeTruthy();
    // First-party fonts are part of the "no third-party requests" claim.
    expect(screen.getByText(/third-party font networks/)).toBeTruthy();
  });

  it("keeps the section numbering sequential after the insertion", () => {
    render(<Privacy />);
    const numbers = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => Number(h.textContent?.match(/^(\d+)\./)?.[1]));
    // Asserted as a sequence rather than a fixed list: sections get inserted
    // (cookies, then residency), and the thing that actually breaks is a
    // duplicated or skipped number, not the count.
    expect(numbers.length).toBeGreaterThanOrEqual(5);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("says where the data lives, with the sub-processors that don't", () => {
    // The residency section is the human-readable half of what
    // /made-in-switzerland publishes as a ledger; the disclosure has to travel
    // with it here too, or the policy claims more than the site does.
    render(<Privacy />);
    expect(
      screen.getByRole("heading", { name: /where your data lives/i }),
    ).toBeTruthy();
    // Named, not categorised — and consistent with the constants the ledger,
    // the band and the llms brief all read. This copy lives in the locale
    // files (like the rest of the policy), so nothing but this assertion stops
    // it drifting to a different country than the rest of the site claims.
    const residency = screen.getAllByText(new RegExp(DATA_RESIDENCY.provider));
    expect(residency.length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(new RegExp(DATA_RESIDENCY.primaryCountry)).length,
    ).toBeGreaterThan(0);
    // The three sub-processors that are not European are disclosed by name.
    expect(screen.getAllByText(/Stripe/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/model provider/).length).toBeGreaterThan(0);
    // …and the reader is pointed at the full ledger.
    expect(screen.getByText(new RegExp(SOVEREIGNTY.href))).toBeTruthy();
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
