import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  SketchUnderline,
  SketchDivider,
  SketchCircle,
  SketchArrow,
} from "./SketchAccents";

afterEach(cleanup);

describe("SketchAccents", () => {
  it("renders each accent as a decorative, non-interactive SVG", () => {
    for (const Accent of [
      SketchUnderline,
      SketchDivider,
      SketchCircle,
      SketchArrow,
    ]) {
      const { container } = render(<Accent />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      // Decorative only: hidden from the a11y tree and never focusable.
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      expect(svg?.getAttribute("focusable")).toBe("false");
      // Drawn in currentColor so a parent can theme the stroke (gold accent).
      expect(svg?.querySelector('path[stroke="currentColor"]')).toBeTruthy();
      cleanup();
    }
  });

  it("forwards a className to the svg element", () => {
    const { container } = render(<SketchUnderline className="text-gold" />);
    expect(
      container.querySelector("svg")?.classList.contains("text-gold"),
    ).toBe(true);
  });
});
