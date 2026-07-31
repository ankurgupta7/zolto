import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Segment from "./Segment";
import { SEGMENTS, segmentFeatures } from "@shared/segments";

afterEach(cleanup);

function renderSegment(path: string) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <Route path="/for" component={Segment} />
      <Route path="/for/:segment" component={Segment} />
    </Router>,
  );
}

describe("Segment — index", () => {
  it("links to every segment page", () => {
    renderSegment("/for");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    for (const s of SEGMENTS) {
      expect(hrefs).toContain(`/for/${s.id}`);
    }
  });
});

describe("Segment — per audience", () => {
  it("renders each segment's headline, problems and scenario", () => {
    for (const s of SEGMENTS) {
      cleanup();
      renderSegment(`/for/${s.id}`);
      expect(
        screen.getByRole("heading", { name: s.headline, level: 1 }),
      ).toBeTruthy();
      for (const p of s.painPoints) {
        expect(screen.getByText(p)).toBeTruthy();
      }
      expect(screen.getByText(s.scenario)).toBeTruthy();
    }
  });

  it("describes features using the shared product copy, not retyped claims", () => {
    const s = SEGMENTS[0];
    renderSegment(`/for/${s.id}`);
    for (const f of segmentFeatures(s)) {
      expect(screen.getByText(f.name)).toBeTruthy();
      expect(screen.getByText(f.description)).toBeTruthy();
    }
  });

  it("cross-links the other segments without linking to itself", () => {
    const [first, ...rest] = SEGMENTS;
    renderSegment(`/for/${first.id}`);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    for (const s of rest) {
      expect(hrefs).toContain(`/for/${s.id}`);
    }
    expect(hrefs).not.toContain(`/for/${first.id}`);
  });

  it("sets a per-segment document title", () => {
    renderSegment("/for/market-stalls");
    expect(document.title).toContain("van");
  });

  it("falls back to the index for an unknown segment", () => {
    renderSegment("/for/nonesuch");
    expect(
      screen.getByRole("heading", { name: /Who Zolto is for/, level: 1 }),
    ).toBeTruthy();
  });
});
