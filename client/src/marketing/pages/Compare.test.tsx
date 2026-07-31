import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Compare from "./Compare";
import { COMPETITORS, INCUMBENT_COMPARISON } from "@shared/platform";

afterEach(cleanup);

function renderCompare(path: string) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <Route path="/compare" component={Compare} />
      <Route path="/compare/:slug" component={Compare} />
    </Router>,
  );
}

describe("Compare — index", () => {
  it("links to a page for every named incumbent", () => {
    renderCompare("/compare");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    for (const c of COMPETITORS) {
      expect(hrefs).toContain(`/compare/zolto-vs-${c.id}`);
    }
  });
});

describe("Compare — per competitor", () => {
  it("renders a heading naming both products", () => {
    renderCompare("/compare/zolto-vs-sumup");
    expect(
      screen.getByRole("heading", { name: "Zolto vs SumUp", level: 1 }),
    ).toBeTruthy();
  });

  it("concedes where the incumbent is the better choice", () => {
    const sumup = COMPETITORS.find((c) => c.id === "sumup")!;
    renderCompare("/compare/zolto-vs-sumup");
    expect(
      screen.getByRole("heading", {
        name: "When SumUp is the better choice",
        level: 2,
      }),
    ).toBeTruthy();
    for (const point of sumup.betterWhen) {
      expect(screen.getByText(point)).toBeTruthy();
    }
  });

  it("states where Zolto fits better", () => {
    const sumup = COMPETITORS.find((c) => c.id === "sumup")!;
    renderCompare("/compare/zolto-vs-sumup");
    for (const point of sumup.zoltoWhen) {
      expect(screen.getByText(point)).toBeTruthy();
    }
  });

  it("renders the shared comparison rows", () => {
    renderCompare("/compare/zolto-vs-stripe");
    for (const row of INCUMBENT_COMPARISON) {
      expect(screen.getByRole("rowheader", { name: row.feature })).toBeTruthy();
    }
  });

  it("makes no pricing claim about the competitor, and says why", () => {
    renderCompare("/compare/zolto-vs-worldline");
    expect(
      screen.getByText(/vary by country, contract and volume/),
    ).toBeTruthy();
  });

  it("cross-links the other comparisons", () => {
    renderCompare("/compare/zolto-vs-stripe");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/compare/zolto-vs-sumup");
    expect(hrefs).toContain("/compare/zolto-vs-worldline");
    expect(hrefs).not.toContain("/compare/zolto-vs-stripe");
  });

  it("sets a per-competitor document title", () => {
    renderCompare("/compare/zolto-vs-sumup");
    expect(document.title).toContain("SumUp");
  });

  it("falls back to the index for an unknown competitor", () => {
    renderCompare("/compare/zolto-vs-nonesuch");
    expect(
      screen.getByRole("heading", { name: "Compare Zolto", level: 1 }),
    ).toBeTruthy();
  });
});
