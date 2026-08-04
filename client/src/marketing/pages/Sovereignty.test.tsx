import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  SOVEREIGNTY,
  DATA_RESIDENCY,
  sovereigntyByState,
} from "@shared/platform";
import Sovereignty from "./Sovereignty";

afterEach(cleanup);

function renderPage() {
  const { hook } = memoryLocation({
    path: SOVEREIGNTY.href,
    static: true,
  });
  return render(
    <Router hook={hook}>
      <Sovereignty />
    </Router>,
  );
}

describe("Sovereignty (/made-in-switzerland)", () => {
  it("states the origin and the order it serves in", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: `${SOVEREIGNTY.headline} ${SOVEREIGNTY.headlineEmphasis}`,
      }),
    ).toBeTruthy();
    expect(screen.getByText(SOVEREIGNTY.serving)).toBeTruthy();
  });

  it("shows what happens next to every unfinished row", () => {
    renderPage();
    // The landing band shows today's state; this page is where the promise
    // is made, so each moving/foreign row's `next` has to be on the page.
    for (const entry of [
      ...sovereigntyByState("moving"),
      ...sovereigntyByState("foreign"),
    ]) {
      expect(entry.next).toBeTruthy();
      expect(screen.getByText(entry.next as string)).toBeTruthy();
    }
  });

  it("explains why, and commits to keeping the ledger current", () => {
    renderPage();
    for (const reason of SOVEREIGNTY.why) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
    expect(screen.getByText(SOVEREIGNTY.promise)).toBeTruthy();
  });

  it("carries the hosting detail and its sub-processor caveat", () => {
    // Reuses the DataResidency band rather than restating hosting here, so
    // the caveat travels with it automatically.
    renderPage();
    expect(screen.getByText(DATA_RESIDENCY.body)).toBeTruthy();
    expect(screen.getByText(DATA_RESIDENCY.caveat)).toBeTruthy();
  });

  it("sets a document title naming Switzerland", () => {
    renderPage();
    expect(document.title).toMatch(/Made in Switzerland/i);
  });

  it("routes to signup", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/signup");
  });
});
