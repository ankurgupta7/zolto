import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import ProductDiscoveryControls, {
  type SortOption,
  type ViewMode,
} from "./ProductDiscoveryControls";

// Radix Select relies on browser APIs jsdom does not implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

const onSortChange = vi.fn();
const onViewModeChange = vi.fn();
const onToggleCategory = vi.fn();
const onSearchChange = vi.fn();

function renderControls({
  sortBy = "newest" as SortOption,
  viewMode = "grid" as ViewMode,
  totalProducts = 5,
  expandedCategories = new Set<string>(),
  searchQuery,
  matchCount,
  searchable = false,
}: {
  sortBy?: SortOption;
  viewMode?: ViewMode;
  totalProducts?: number;
  expandedCategories?: Set<string>;
  searchQuery?: string;
  matchCount?: number;
  searchable?: boolean;
} = {}) {
  return render(
    <ProductDiscoveryControls
      sortBy={sortBy}
      onSortChange={onSortChange}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      expandedCategories={expandedCategories}
      onToggleCategory={onToggleCategory}
      totalProducts={totalProducts}
      searchQuery={searchQuery}
      onSearchChange={searchable ? onSearchChange : undefined}
      matchCount={matchCount}
    />,
  );
}

/* jsdom has no pointer events, so the select is driven by keyboard: the
   trigger opens on ArrowDown and items select on Enter (Radix's OPEN_KEYS /
   SELECTION_KEYS). */
function openSortSelect() {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
}

// The storefront falls back to German when the browser asks for it; pin
// English so the label assertions below read the source strings.
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("ProductDiscoveryControls", () => {
  it("shows the product count with correct pluralization", () => {
    renderControls({ totalProducts: 5 });
    expect(screen.getByText("5 products")).toBeTruthy();
    cleanup();
    renderControls({ totalProducts: 1 });
    expect(screen.getByText("1 product")).toBeTruthy();
  });

  it("shows the current sort option in the trigger", () => {
    renderControls({ sortBy: "name" });
    expect(screen.getByRole("combobox").textContent).toContain("By Name (A-Z)");
  });

  it("emits the chosen sort option", () => {
    renderControls();
    openSortSelect();
    fireEvent.keyDown(screen.getByRole("option", { name: "By Category" }), {
      key: "Enter",
    });
    expect(onSortChange).toHaveBeenCalledWith("category");
  });

  it("offers all three sort options", () => {
    renderControls();
    openSortSelect();
    expect(screen.getByRole("option", { name: "Newest First" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "By Category" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "By Name (A-Z)" })).toBeTruthy();
  });

  it("switches between grid and list view", () => {
    renderControls({ viewMode: "grid" });
    fireEvent.click(screen.getByLabelText("List view"));
    expect(onViewModeChange).toHaveBeenCalledWith("list");
    cleanup();
    onViewModeChange.mockClear();

    renderControls({ viewMode: "list" });
    fireEvent.click(screen.getByLabelText("Grid view"));
    expect(onViewModeChange).toHaveBeenCalledWith("grid");
  });

  it("never clears the view mode when the active toggle is re-clicked", () => {
    renderControls({ viewMode: "grid" });
    // Radix reports "" for a deselected single toggle; the component guards it.
    fireEvent.click(screen.getByLabelText("Grid view"));
    expect(onViewModeChange).not.toHaveBeenCalled();
  });

  it("hides the category expand/collapse row unless sorting by category", () => {
    renderControls({ sortBy: "newest" });
    expect(screen.queryByText("Expand All")).toBeNull();
    expect(screen.queryByText("Collapse All")).toBeNull();
  });

  it("expands and collapses all categories via the sentinel values", () => {
    renderControls({ sortBy: "category" });
    fireEvent.click(screen.getByText("Expand All"));
    expect(onToggleCategory).toHaveBeenCalledWith("__expand_all__");
    fireEvent.click(screen.getByText("Collapse All"));
    expect(onToggleCategory).toHaveBeenCalledWith("__collapse_all__");
  });

  it("renders labels, titles and the plural count in French", async () => {
    await i18n.changeLanguage("fr");
    try {
      renderControls({ sortBy: "category", totalProducts: 3 });
      expect(screen.getByText("Trier par :")).toBeTruthy();
      expect(screen.getByText("Affichage :")).toBeTruthy();
      expect(screen.getByText("3 produits")).toBeTruthy();
      expect(screen.getByText("Tout déplier")).toBeTruthy();
      expect(screen.getByText("Tout replier")).toBeTruthy();
      expect(screen.getByLabelText("Vue en grille")).toBeTruthy();
      expect(screen.getByTitle("Vue en liste avec détails")).toBeTruthy();
      // French has a `many` plural category English lacks; the singular must
      // still agree at 1.
      cleanup();
      renderControls({ totalProducts: 1 });
      expect(screen.getByText("1 produit")).toBeTruthy();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

describe("ProductDiscoveryControls — inventory filter", () => {
  it("renders no search box unless a change handler is supplied", () => {
    renderControls();
    expect(screen.queryByLabelText("Search your inventory")).toBeNull();
  });

  it("emits every keystroke so the list narrows as you type", () => {
    renderControls({ searchable: true, searchQuery: "" });
    const box = screen.getByLabelText("Search your inventory");
    fireEvent.change(box, { target: { value: "silb" } });
    expect(onSearchChange).toHaveBeenCalledWith("silb");
  });

  it("shows the current query and does not submit anywhere", () => {
    const { container } = renderControls({
      searchable: true,
      searchQuery: "silber",
    });
    expect(
      (screen.getByLabelText("Search your inventory") as HTMLInputElement)
        .value,
    ).toBe("silber");
    // A filter has no destination — a form would take the merchant off-page.
    expect(container.querySelector("form")).toBeNull();
  });

  it("offers a clear button only once something is typed", () => {
    renderControls({ searchable: true, searchQuery: "" });
    expect(screen.queryByLabelText("Clear search")).toBeNull();
    cleanup();

    renderControls({ searchable: true, searchQuery: "silber" });
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("treats whitespace as no query at all", () => {
    renderControls({ searchable: true, searchQuery: "   ", matchCount: 0 });
    expect(screen.queryByLabelText("Clear search")).toBeNull();
    // …and reports the whole catalogue, not an empty catch.
    expect(screen.getByText("5 products")).toBeTruthy();
  });

  it("clears on Escape", () => {
    renderControls({ searchable: true, searchQuery: "silber" });
    fireEvent.keyDown(screen.getByLabelText("Search your inventory"), {
      key: "Escape",
    });
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("reports the catch against the catalogue while filtering", () => {
    renderControls({
      searchable: true,
      searchQuery: "silber",
      matchCount: 2,
      totalProducts: 17,
    });
    expect(screen.getByText("2 of 17")).toBeTruthy();
    expect(screen.queryByText("17 products")).toBeNull();
  });

  it("falls back to the plain count when no match count is given", () => {
    renderControls({ searchable: true, searchQuery: "silber" });
    expect(screen.getByText("5 products")).toBeTruthy();
  });

  it("translates the filter", async () => {
    await i18n.changeLanguage("de");
    try {
      renderControls({
        searchable: true,
        searchQuery: "silber",
        matchCount: 2,
        totalProducts: 17,
      });
      expect(screen.getByLabelText("Bestand durchsuchen")).toBeTruthy();
      expect(screen.getByLabelText("Suche löschen")).toBeTruthy();
      expect(screen.getByText("2 von 17")).toBeTruthy();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

describe("ProductDiscoveryControls — French plurals", () => {
  it("renders labels, titles and the plural count in French", async () => {
    await i18n.changeLanguage("fr");
    try {
      renderControls({ sortBy: "category", totalProducts: 3 });
      expect(screen.getByText("Trier par :")).toBeTruthy();
      expect(screen.getByText("Affichage :")).toBeTruthy();
      expect(screen.getByText("3 produits")).toBeTruthy();
      expect(screen.getByText("Tout déplier")).toBeTruthy();
      expect(screen.getByText("Tout replier")).toBeTruthy();
      expect(screen.getByLabelText("Vue en grille")).toBeTruthy();
      expect(screen.getByTitle("Vue en liste avec détails")).toBeTruthy();
      // French has a `many` plural category English lacks; the singular must
      // still agree at 1.
      cleanup();
      renderControls({ totalProducts: 1 });
      expect(screen.getByText("1 produit")).toBeTruthy();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
