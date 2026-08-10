import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AI_NATIVE_PITCH } from "@shared/platform";
import en from "../locales/en.json";
import WhyZolto from "./WhyZolto";

afterEach(cleanup);

function renderPage() {
  const { hook } = memoryLocation({ path: "/why-zolto", static: true });
  return render(
    <Router hook={hook}>
      <WhyZolto />
    </Router>,
  );
}

/**
 * Everything asserted here was asserted on Landing.test.tsx until the homepage
 * became a reel. The bands moved rather than being dropped, so their tests
 * moved with them — that is the whole point of this file.
 */
describe("WhyZolto", () => {
  it("opens on the thesis the homepage links here from", () => {
    renderPage();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headline);
    expect(heading.textContent).toContain(AI_NATIVE_PITCH.headlineEmphasis);
    expect(screen.getByText(AI_NATIVE_PITCH.body)).toBeTruthy();
  });

  it("proves the thesis: a real agent purchase, on a real MCP endpoint", () => {
    renderPage();
    expect(screen.getByTestId("agent-chat-mock")).toBeTruthy();
    expect(screen.getByText(/Order placed/i)).toBeTruthy();
    expect(screen.getByText(/bergblume\.zolto\.ch\/mcp/i)).toBeTruthy();
    // The endpoint a reader can go and try for themselves.
    expect(
      screen.getByRole("link", { name: /llms\.txt/i }).getAttribute("href"),
    ).toBe("/llms.txt");
  });

  it("explains the found → asked → bought mechanics, one card per step", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /How an AI buys from you/i }),
    ).toBeTruthy();
    for (const step of AI_NATIVE_PITCH.steps) {
      expect(screen.getByText(step.title)).toBeTruthy();
      expect(screen.getByText(step.body)).toBeTruthy();
    }
    expect(screen.getByText(AI_NATIVE_PITCH.footnote)).toBeTruthy();
  });

  it("carries the end-of-day reconciliation email, whole", () => {
    renderPage();
    // Every locale key the mock used on the homepage renders here instead —
    // none of them needed re-translating to make the move.
    for (const key of [
      "emailFrom",
      "emailSubjectLabel",
      "emailSubject",
      "emailBody",
      "emailItem1Name",
      "emailItem1Meta",
      "emailItem2Name",
      "emailItem2Meta",
      "emailConfirm",
    ] as const) {
      expect(
        (document.body.textContent ?? "").includes(en.landing[key]),
        `landing.${key} is missing`,
      ).toBe(true);
    }
  });

  it("offers a way onward rather than ending in a footnote", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/signup");
    expect(hrefs).toContain("/pricing");
  });

  it("sets its own title and description, so it can be found on its own", () => {
    renderPage();
    expect(document.title).toContain("Zolto");
    const description = document.head.querySelector('meta[name="description"]');
    expect(description?.getAttribute("content")).toBeTruthy();
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toContain("/why-zolto");
  });
});
