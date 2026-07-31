import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import NotFound from "./NotFound";

afterEach(() => {
  cleanup();
  document.head.querySelector('meta[name="robots"]')?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

function renderNotFound() {
  const { hook } = memoryLocation({ path: "/nope", static: true });
  return render(
    <Router hook={hook}>
      <NotFound />
    </Router>,
  );
}

describe("marketing NotFound", () => {
  it("says plainly that the page isn't there", () => {
    renderNotFound();
    expect(
      screen.getByRole("heading", { level: 1, name: /nothing on this page/i }),
    ).toBeTruthy();
  });

  it("offers the three real destinations instead of a dead end", () => {
    renderNotFound();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/pricing");
    expect(hrefs).toContain("/faq");
  });

  it("takes the blame for a moved link rather than the visitor", () => {
    renderNotFound();
    expect(screen.getByText(/that.s on us/i)).toBeTruthy();
  });

  it("asks search engines not to index it", () => {
    renderNotFound();
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toMatch(/noindex/);
  });

  it("advertises no canonical URL — a 404 has no real address", () => {
    renderNotFound();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
