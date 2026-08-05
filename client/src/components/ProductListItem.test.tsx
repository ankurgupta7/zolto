import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import ProductListItem from "./ProductListItem";

// Locale columns ride along on real product rows; extra fields must not
// bother the component.
const product = {
  id: 1,
  name: "Silver Ring",
  nameEn: "Silver Ring",
  nameDe: "Silberring",
  nameFr: null,
  nameIt: null,
  description: "Hand-forged sterling silver",
  price: "49.90",
  category: "Rings",
  imageUrl: "https://cdn.example/ring.jpg",
  visible: true,
  sold: false,
  quantity: 3,
  createdAt: new Date("2026-05-12T10:00:00Z"),
};

const handlers = {
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onToggleVisibility: vi.fn(),
  onToggleSold: vi.fn(),
};

// The storefront falls back to German when the browser asks for it; pin
// English so the label assertions below read the source strings.
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});
afterEach(() => cleanup());

describe("ProductListItem", () => {
  it("renders name, description, formatted price, quantity and date", () => {
    render(<ProductListItem product={product} {...handlers} />);
    expect(screen.getByText("Silver Ring")).toBeTruthy();
    expect(screen.getByText("Hand-forged sterling silver")).toBeTruthy();
    expect(screen.getByText("CHF 49.90")).toBeTruthy();
    expect(screen.getByText("Qty: 3")).toBeTruthy();
    // Dates follow the active language's Swiss locale (en -> en-CH), not en-US.
    expect(screen.getByText("12 May 2026")).toBeTruthy();
    const img = screen.getByAltText("Silver Ring") as HTMLImageElement;
    expect(img.src).toBe("https://cdn.example/ring.jpg");
  });

  it("omits the image block and shows the sold badge for a sold item", () => {
    render(
      <ProductListItem
        product={{ ...product, imageUrl: null, sold: true }}
        {...handlers}
      />,
    );
    expect(screen.queryByAltText("Silver Ring")).toBeNull();
    expect(screen.getByText("• Sold")).toBeTruthy();
  });

  it("toggles visibility with a title matching current state", () => {
    render(<ProductListItem product={product} {...handlers} />);
    fireEvent.click(screen.getByTitle("Hide from shop"));
    expect(handlers.onToggleVisibility).toHaveBeenCalledTimes(1);
  });

  it("offers Show in shop when hidden", () => {
    render(
      <ProductListItem
        product={{ ...product, visible: false }}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByTitle("Show in shop"));
    expect(handlers.onToggleVisibility).toHaveBeenCalledTimes(1);
  });

  it("fires edit and delete callbacks from their buttons", () => {
    render(<ProductListItem product={product} {...handlers} />);
    fireEvent.click(screen.getByTitle("Edit product"));
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Delete product"));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  });
});
