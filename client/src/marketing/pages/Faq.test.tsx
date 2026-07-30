import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Faq from "./Faq";
import { FAQS, FAQ_CATEGORIES, faqsByCategory } from "@shared/platform";

afterEach(cleanup);

function renderFaq() {
  const { hook } = memoryLocation({ path: "/faq", static: true });
  return render(
    <Router hook={hook}>
      <Faq />
    </Router>,
  );
}

describe("Faq", () => {
  it("renders every shared FAQ question and answer", () => {
    renderFaq();
    for (const item of FAQS) {
      expect(screen.getByText(item.q)).toBeTruthy();
      expect(screen.getByText(item.a)).toBeTruthy();
    }
  });

  it("groups the questions under their categories", () => {
    renderFaq();
    for (const category of FAQ_CATEGORIES) {
      if (faqsByCategory(category).length === 0) continue;
      expect(
        screen.getByRole("heading", { name: category, level: 2 }),
      ).toBeTruthy();
    }
  });

  it("surfaces the billing answers that previously lived only in Pricing.tsx", () => {
    renderFaq();
    expect(screen.getByText("Is there a contract?")).toBeTruthy();
    expect(screen.getByText("Do prices include VAT?")).toBeTruthy();
  });

  it("sets a descriptive document title for the route", () => {
    renderFaq();
    expect(document.title).toContain("FAQ");
  });

  it("offers a route to signing up and to pricing", () => {
    renderFaq();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/signup");
    expect(hrefs).toContain("/pricing");
  });
});
