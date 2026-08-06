import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { POSITIONING } from "@shared/platform";
import { source } from "@shared/sources";
import { SqueezePlay } from "./SqueezePlay";
import { SqueezePlayTill } from "./MarketingIllustrations";

afterEach(cleanup);

const sp = POSITIONING.squeezePlay;

describe("SqueezePlay", () => {
  it("shows three tills, in concede-concede-land order", () => {
    render(<SqueezePlay />);
    const panels = screen.getAllByTestId(/^squeeze-panel-/);
    expect(panels.length).toBe(3);
    expect(panels.map((p) => p.dataset.testid)).toEqual([
      "squeeze-panel-grid-no-twint",
      "squeeze-panel-twint-no-grid",
      "squeeze-panel-both",
    ]);
  });

  it("gives every till an accessible name rather than hiding the drawing", () => {
    // Unlike the decorative market-stall scenes, these carry the argument. A
    // screen-reader user who can't see three phones still needs to be told
    // which one is missing what.
    render(<SqueezePlay />);
    const images = screen.getAllByRole("img");
    expect(images.length).toBe(3);
    for (const panel of sp.panels) {
      expect(screen.getAllByTitle(panel.label).length).toBeGreaterThan(0);
    }
  });

  it("concedes what each incumbent genuinely does well, before the punchline", () => {
    render(<SqueezePlay />);
    const gridPanel = within(screen.getByTestId("squeeze-panel-grid-no-twint"));
    expect(gridPanel.getByText(/photos, prices, stock counts/i)).toBeTruthy();
    const twintPanel = within(
      screen.getByTestId("squeeze-panel-twint-no-grid"),
    );
    expect(twintPanel.getByText(/a good flat rate/i)).toBeTruthy();
  });

  it("scopes the exclusivity claim to the three named options", () => {
    // A bare "no other solution offers both" is a claim about every product in
    // every country — unverifiable when written, stale a week later, and the
    // exact species of claim the pricing review exists to remove. The scoped
    // version says the same thing to a reader and can actually be checked.
    render(<SqueezePlay />);
    expect(screen.getByTestId("squeeze-claim").textContent).toMatch(
      /three ways/i,
    );
    expect(sp.claim).not.toMatch(/no other|nobody else|only zolto/i);
    // "only one" is the permitted form — it's a count of the named field, not
    // an assertion about every product that exists.
    expect(sp.claim).toMatch(/only one/i);
  });

  it("cites the vendor's own documentation for each concession", () => {
    render(<SqueezePlay />);
    for (const panel of sp.panels) {
      if (!("sourceId" in panel) || !panel.sourceId) continue;
      const s = source(panel.sourceId);
      const link = screen.getByRole("link", { name: s.label });
      expect(link.getAttribute("href")).toBe(s.url);
    }
  });

  it("shows when each source was read", () => {
    render(<SqueezePlay />);
    const cited = sp.panels.filter((p) => "sourceId" in p && p.sourceId);
    expect(cited.length).toBeGreaterThan(0);
    for (const panel of cited) {
      const s = source((panel as { sourceId: string }).sourceId);
      expect(
        screen.getAllByText(new RegExp(s.retrievedOn)).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("SqueezePlayTill", () => {
  const svg = () => document.querySelector("svg")!;

  it("draws a catalogue grid only when the till has one", () => {
    const { unmount } = render(<SqueezePlayTill has={["grid"]} title="grid" />);
    // Six wares, two columns by three rows, plus the handset itself.
    expect(svg().querySelectorAll("rect").length).toBeGreaterThan(6);
    expect(svg().querySelectorAll("circle").length).toBe(0);
    unmount();

    render(<SqueezePlayTill has={["twint"]} title="keypad" />);
    // A keypad instead: nine dots and no wares.
    expect(svg().querySelectorAll("circle").length).toBe(9);
  });

  it("strikes the QR glyph through on a till that can't take TWINT", () => {
    const { unmount } = render(<SqueezePlayTill has={["grid"]} title="a" />);
    const strokes = Array.from(svg().querySelectorAll("path")).map((p) =>
      p.getAttribute("d"),
    );
    expect(strokes).toContain("M5 128 L35 98");
    unmount();

    render(<SqueezePlayTill has={["grid", "twint"]} title="b" />);
    const after = Array.from(svg().querySelectorAll("path")).map((p) =>
      p.getAttribute("d"),
    );
    expect(after).not.toContain("M5 128 L35 98");
  });

  it("draws the strike thicker than the glyph it cancels", () => {
    // At phone width the panels stack and shrink. A hairline strike over a QR
    // square reads as a smudge rather than as an absence, and that stroke is
    // carrying the entire argument.
    render(<SqueezePlayTill has={["grid"]} title="a" />);
    const strike = Array.from(svg().querySelectorAll("path")).find(
      (p) => p.getAttribute("d") === "M5 128 L35 98",
    )!;
    expect(Number(strike.getAttribute("stroke-width"))).toBeGreaterThan(2);
  });

  it("contains no text, so every label stays translatable", () => {
    // Text baked into an SVG never reaches the four-language key-parity check
    // in locales.test.ts — it just silently ships in English everywhere.
    render(<SqueezePlayTill has={["grid", "twint"]} title="whatever" />);
    expect(svg().querySelectorAll("text").length).toBe(0);
    expect(svg().querySelectorAll("tspan").length).toBe(0);
  });

  it("draws no numerals, so no money renders in oldstyle figures", () => {
    render(<SqueezePlayTill has={["grid"]} title="a" />);
    // Prices are a short rule under each ware, never a figure.
    expect(svg().textContent).toBe("a");
  });

  it("shows cash only on the till that takes everything", () => {
    // Drawn as a banknote — a rect with a circle in it. Two overlapping coins
    // read as an ampersand once the panel shrinks to a third of its width.
    const { unmount } = render(
      <SqueezePlayTill has={["grid", "twint"]} title="a" />,
    );
    expect(svg().querySelectorAll("circle").length).toBe(1);
    unmount();
    render(<SqueezePlayTill has={["grid"]} title="b" />);
    expect(svg().querySelectorAll("circle").length).toBe(0);
  });
});
