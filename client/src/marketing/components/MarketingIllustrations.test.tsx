import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
  NecklaceSketch,
  StallOpensScene,
  TapToPayScene,
  ReconciliationEmailScene,
} from "./MarketingIllustrations";

afterEach(cleanup);

describe("OneInventoryDiagram", () => {
  it("names both selling channels", () => {
    render(<OneInventoryDiagram />);
    expect(screen.getByText("Market stall")).toBeTruthy();
    expect(screen.getByText("Web storefront")).toBeTruthy();
  });

  it("echoes the same stock count on both channels to show sync", () => {
    render(<OneInventoryDiagram />);
    expect(screen.getAllByText("12 in stock")).toHaveLength(2);
  });
});

describe("PhotoToListing", () => {
  it("shows the generated listing title and price crisply", () => {
    render(<PhotoToListing />);
    expect(screen.getByText("Moonstone Pendant Necklace")).toBeTruthy();
    expect(screen.getByText("CHF 180")).toBeTruthy();
  });

  it("sketches the necklace in both the before and after frames", () => {
    const { container } = render(<PhotoToListing />);
    // Two NecklaceSketch SVGs (before + after) plus the SketchArrow.
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
    // The old placeholder camera icon and diamond glyph are gone.
    expect(container.querySelector(".lucide-camera")).toBeNull();
    expect(container.textContent).not.toContain("◇");
  });

  it("keeps before and after side by side at every width", () => {
    // Stacked, the pair is 550px on a 375px phone — most of the screen a reel
    // panel has — and a before/after only reads as a comparison when both
    // frames are visible at once. jsdom has no viewport, so the check is that
    // the columns are unconditional rather than an `sm:` upgrade.
    const { container } = render(<PhotoToListing />);
    const grid = container.firstElementChild!;
    expect(grid.className).toContain("grid-cols-[1fr_auto_1fr]");
    expect(grid.className).not.toContain("sm:grid-cols-");
  });
});

describe("NecklaceSketch", () => {
  it("is a decorative, aria-hidden illustration the frame can tint", () => {
    const { container } = render(<NecklaceSketch className="text-gold" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.classList.contains("text-gold")).toBe(true);
  });

  it("adds facets, beads and a sparkle in the crisp/generated variant", () => {
    const { container: loose } = render(<NecklaceSketch />);
    const { container: crisp } = render(<NecklaceSketch crisp />);
    // The crisp variant carries more marks (facets + beads + sparkle).
    expect(crisp.querySelectorAll("path").length).toBeGreaterThan(
      loose.querySelectorAll("path").length,
    );
    expect(crisp.querySelectorAll("circle").length).toBeGreaterThan(
      loose.querySelectorAll("circle").length,
    );
  });
});

describe("MarketStallScene", () => {
  it("is a decorative, aria-hidden illustration", () => {
    const { container } = render(<MarketStallScene className="text-gold" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.classList.contains("text-gold")).toBe(true);
  });
});

describe("day-in-the-life scenes", () => {
  const SCENES = [
    ["StallOpensScene", StallOpensScene],
    ["TapToPayScene", TapToPayScene],
    ["ReconciliationEmailScene", ReconciliationEmailScene],
  ] as const;

  for (const [name, Scene] of SCENES) {
    describe(name, () => {
      it("is decorative and tintable by its frame", () => {
        const { container } = render(<Scene className="text-gold" />);
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
        expect(svg?.getAttribute("role")).toBe("presentation");
        expect(svg?.classList.contains("text-gold")).toBe(true);
      });

      it("marks every stroke as drawable so the ink-on animation can run", () => {
        // The CSS normalises each stroke with pathLength="1"; a drawable that
        // misses it would jump in fully drawn while its neighbours animate.
        const { container } = render(<Scene />);
        const group = container.querySelector(".sketch-draw");
        expect(group).not.toBeNull();

        const drawables = group?.querySelectorAll(
          "path, circle, rect, line, polyline, ellipse",
        );
        expect(drawables?.length).toBeGreaterThan(0);
        for (const el of Array.from(drawables ?? [])) {
          expect(el.getAttribute("pathLength")).toBe("1");
        }
      });

      it("shares the sequence's frame so the trio reads as one drawing", () => {
        const { container } = render(<Scene />);
        expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
          "0 0 120 100",
        );
      });

      it("carries no text of its own — the caption holds the meaning", () => {
        const { container } = render(<Scene />);
        expect(container.querySelector("text")).toBeNull();
      });
    });
  }
});
