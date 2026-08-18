import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Compare from "./Compare";
import { COMPETITORS, INCUMBENT_COMPARISON } from "@shared/platform";
import { source } from "@shared/sources";

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

  // These three assertions moved here from Landing.test.tsx with the table
  // itself: the homepage became a six-chapter reel with no viewport to spare
  // for a seven-row table, and this index — where the reader is choosing but
  // hasn't picked a product yet — is the right altitude for the generic one.
  it("carries the generic old-guard table, row for row", () => {
    renderCompare("/compare");
    const table = within(screen.getByTestId("incumbent-comparison"));
    expect(table.getByText("The old guard")).toBeTruthy();
    for (const row of INCUMBENT_COMPARISON) {
      expect(table.getByText(row.feature)).toBeTruthy();
      expect(table.getByText(row.them)).toBeTruthy();
      expect(table.getByText(row.us, { exact: false })).toBeTruthy();
    }
  });

  it("makes the disruption case without claiming to be the cheapest", () => {
    // The comparison intro used to open on "a card reader was basically a
    // status symbol — you're still paying for that era", which stopped being
    // true when SumUp and Worldline both shipped softPOS. It now concedes the
    // card rate in its first breath, because the table underneath does too —
    // and it has to concede the SAME amount. It said "two of them beat us"
    // while the row beneath it said "every one of them", which is the kind of
    // gap a reader closes by trusting neither.
    renderCompare("/compare");
    expect(
      screen.getByText(/every one of them beats us on card rate/i),
    ).toBeTruthy();
  });

  it("keeps the table's own heading with it", () => {
    renderCompare("/compare");
    expect(
      screen.getByRole("heading", {
        name: /What you.re actually paying them for/i,
      }),
    ).toBeTruthy();
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

  it("tells the argument once, in its specific form", () => {
    // The generic seven-row "old guard vs Zolto" table used to sit above the
    // capability matrix. Once the matrix widened from ten payment rows to the
    // whole product, that was the same argument told twice on a page about one
    // named competitor — the second time better. It still renders on the
    // /compare index, where the reader hasn't picked a competitor yet.
    renderCompare("/compare/zolto-vs-sumup");
    expect(screen.getByTestId("capability-matrix")).toBeTruthy();
    for (const row of INCUMBENT_COMPARISON) {
      expect(
        screen.queryByRole("rowheader", { name: row.feature }),
        `generic row "${row.feature}" should not be duplicated here`,
      ).toBeNull();
    }
  });

  it("quotes the competitor's pricing, with a source and a date on each figure", () => {
    // This test used to assert the opposite — that the page made no pricing
    // claim, "because rates vary by country, contract and volume". The August
    // 2026 review replaced that silence with a provenance rule: figures may
    // ship, but only sourced and dated. See positioning-pricing-revision.md §2a.
    renderCompare("/compare/zolto-vs-worldline");
    const table = screen.getByTestId("cost-of-acceptance");
    expect(within(table).getByText(/1\.70%/)).toBeTruthy();
    const worldline = COMPETITORS.find((c) => c.id === "worldline")!;
    for (const id of worldline.sourceIds ?? []) {
      const s = source(id);
      expect(s.url).toMatch(/^https?:\/\//);
      expect(s.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("prices the competitor's ticks rather than leaving them unqualified", () => {
    // The mechanism the widened matrix turns on: where they DO have something,
    // say what it costs.
    renderCompare("/compare/zolto-vs-worldline");
    expect(screen.getByTestId("cost-online-store").textContent).toMatch(
      /9\.95/,
    );
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
