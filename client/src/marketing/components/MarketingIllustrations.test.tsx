import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  OneInventoryDiagram,
  PhotoToListing,
  MarketStallScene,
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
});

describe("MarketStallScene", () => {
  it("is a decorative, aria-hidden illustration", () => {
    const { container } = render(<MarketStallScene className="text-gold" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.classList.contains("text-gold")).toBe(true);
  });
});
