import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
  DropEarringsSketch,
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
    expect(screen.getByText("Moonstone Drop Earrings")).toBeTruthy();
    expect(screen.getByText("CHF 180")).toBeTruthy();
  });

  it("sketches the earrings in both the before and after frames", () => {
    const { container } = render(<PhotoToListing />);
    // Two DropEarringsSketch SVGs (before + after) plus the SketchArrow.
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
    // The old placeholder camera icon and diamond glyph are gone.
    expect(container.querySelector(".lucide-camera")).toBeNull();
    expect(container.textContent).not.toContain("◇");
  });
});

describe("DropEarringsSketch", () => {
  it("is a decorative, aria-hidden illustration the frame can tint", () => {
    const { container } = render(
      <DropEarringsSketch className="text-gold" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.classList.contains("text-gold")).toBe(true);
  });

  it("draws two earrings by default and adds a sparkle when crisp", () => {
    const { container: loose } = render(<DropEarringsSketch />);
    const { container: crisp } = render(<DropEarringsSketch crisp />);
    // The crisp/generated variant carries more marks (facets + sparkle).
    const loosePaths = loose.querySelectorAll("path").length;
    const crispPaths = crisp.querySelectorAll("path").length;
    expect(crispPaths).toBeGreaterThan(loosePaths);
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
