import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import NotFound from "./NotFound";

// The storefront defaults to German (see lib/i18n); pin the language per test
// rather than inheriting whatever ran last.
beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(cleanup);

function renderNotFound() {
  const { hook } = memoryLocation({ path: "/gone", static: true });
  return render(
    <Router hook={hook}>
      <NotFound />
    </Router>,
  );
}

describe("storefront NotFound", () => {
  it("greets a lost shopper in the shop's voice", () => {
    renderNotFound();
    expect(
      screen.getByRole("heading", { level: 1, name: en.notFound.title }),
    ).toBeTruthy();
  });

  it("offers both exits — the shop and the front page", () => {
    renderNotFound();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/shop");
    expect(hrefs).toContain("/");
  });

  it("renders translated copy rather than raw i18n keys", () => {
    renderNotFound();
    // A missing key would surface the literal "notFound.body" instead.
    expect(screen.queryByText(/^notFound\./)).toBeNull();
    expect(screen.getByText(en.notFound.body)).toBeTruthy();
  });

  it("has German copy for every key the page renders", () => {
    // The storefront ships de/en; a bad link is the worst moment to fall back.
    for (const key of Object.keys(en.notFound)) {
      expect(de.notFound[key as keyof typeof de.notFound]).toBeTruthy();
    }
  });

  it("follows the shop's language when it switches to German", async () => {
    await i18n.changeLanguage("de");
    renderNotFound();
    expect(
      screen.getByRole("heading", { level: 1, name: de.notFound.title }),
    ).toBeTruthy();
  });
});
