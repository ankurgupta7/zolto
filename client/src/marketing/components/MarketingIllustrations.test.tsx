import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
  NecklaceSketch,
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
