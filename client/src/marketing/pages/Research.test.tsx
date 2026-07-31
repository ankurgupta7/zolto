import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Research from "./Research";
import {
  PILOT_METHODOLOGY,
  PILOT_METRICS,
  PILOT_FINDINGS,
} from "@shared/research";
import { author } from "@shared/authors";

afterEach(cleanup);

function renderResearch() {
  const { hook } = memoryLocation({
    path: `/research/${PILOT_METHODOLOGY.slug}`,
    static: true,
  });
  return render(
    <Router hook={hook}>
      <Research />
    </Router>,
  );
}

describe("Research", () => {
  it("leads with the method, not the numbers", () => {
    renderResearch();
    expect(
      screen.getByRole("heading", { name: "Method", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText(PILOT_METHODOLOGY.sample)).toBeTruthy();
    expect(screen.getByText(PILOT_METHODOLOGY.collection)).toBeTruthy();
  });

  it("renders every headline metric with its caveat", () => {
    renderResearch();
    for (const m of PILOT_METRICS) {
      expect(screen.getByText(m.label)).toBeTruthy();
      expect(screen.getByText(m.note)).toBeTruthy();
    }
  });

  it("publishes the limits section", () => {
    renderResearch();
    expect(
      screen.getByRole("heading", { name: /doesn.t show/i, level: 2 }),
    ).toBeTruthy();
    for (const l of PILOT_METHODOLOGY.limits) {
      expect(screen.getByText(l)).toBeTruthy();
    }
  });

  it("states the findings, including the zero from search", () => {
    renderResearch();
    for (const f of PILOT_FINDINGS) {
      expect(screen.getByText(f)).toBeTruthy();
    }
  });

  it("carries a byline and a machine-readable publication date", () => {
    const { container } = renderResearch();
    const time = container.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(PILOT_METHODOLOGY.published);
    // The byline sits in the same line as the date.
    expect(time?.parentElement?.textContent).toContain(author.name);
  });

  it("tells readers how to cite it", () => {
    renderResearch();
    expect(screen.getByText(/Please cite/i)).toBeTruthy();
  });

  it("sets a document title naming the research", () => {
    renderResearch();
    expect(document.title).toContain(PILOT_METHODOLOGY.title);
  });
});
