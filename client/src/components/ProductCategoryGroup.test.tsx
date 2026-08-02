import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ProductCategoryGroup from "./ProductCategoryGroup";

afterEach(() => cleanup());

describe("ProductCategoryGroup", () => {
  it("renders the category name and product count", () => {
    render(
      <ProductCategoryGroup
        category="Rings"
        isExpanded={false}
        onToggle={vi.fn()}
        productCount={4}
      >
        <p>row content</p>
      </ProductCategoryGroup>,
    );
    expect(screen.getByText("Rings")).toBeTruthy();
    expect(screen.getByText("(4)")).toBeTruthy();
  });

  it("hides children when collapsed and shows them when expanded", () => {
    const { rerender } = render(
      <ProductCategoryGroup
        category="Rings"
        isExpanded={false}
        onToggle={vi.fn()}
        productCount={4}
      >
        <p>row content</p>
      </ProductCategoryGroup>,
    );
    expect(screen.queryByText("row content")).toBeNull();
    rerender(
      <ProductCategoryGroup
        category="Rings"
        isExpanded={true}
        onToggle={vi.fn()}
        productCount={4}
      >
        <p>row content</p>
      </ProductCategoryGroup>,
    );
    expect(screen.getByText("row content")).toBeTruthy();
  });

  it("calls onToggle when the header is clicked", () => {
    const onToggle = vi.fn();
    render(
      <ProductCategoryGroup
        category="Rings"
        isExpanded={false}
        onToggle={onToggle}
        productCount={4}
      >
        <p>row content</p>
      </ProductCategoryGroup>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
