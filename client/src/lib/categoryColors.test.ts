import { describe, expect, it } from "vitest";
import { categoryColor } from "./categoryColors";

describe("categoryColor", () => {
  it("keeps the exact legacy colours for the original jewellery keys", () => {
    expect(categoryColor("Necklaces")).toBe("bg-[#F5EFE8] text-[#8B6914]");
    expect(categoryColor("Rings")).toBe("bg-[#E8F4EC] text-[#2D6B4A]");
    expect(categoryColor("Other")).toBe("bg-[#EEEEEE] text-[#666]");
  });

  it("gives any custom category a deterministic palette colour", () => {
    const first = categoryColor("Mugs & Cups");
    expect(first).toBe(categoryColor("Mugs & Cups"));
    expect(first).toMatch(/^bg-\[#[0-9A-F]{6}\] text-\[#[0-9A-Fa-f]{3,6}\]$/);
  });

  it("different names can land on different colours", () => {
    const names = ["Mugs & Cups", "Bowls", "Vases", "Planters", "Prints"];
    const colours = new Set(names.map(categoryColor));
    expect(colours.size).toBeGreaterThan(1);
  });
});
