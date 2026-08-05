import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Categories from "./Categories";

const mocks = vi.hoisted(() => ({
  categories: [
    {
      key: "Bowls",
      labelEn: "Bowls",
      labelDe: "Schalen",
      labelFr: "Bols",
      labelIt: null,
      extraIncludes: [] as string[],
      sortOrder: 0,
    },
    {
      key: "Vases",
      labelEn: "Vases",
      labelDe: null,
      labelFr: null,
      labelIt: null,
      extraIncludes: [] as string[],
      sortOrder: 1,
    },
    {
      key: "Other",
      labelEn: "Other",
      labelDe: "Sonstiges",
      labelFr: "Autres",
      labelIt: "Altro",
      extraIncludes: [] as string[],
      sortOrder: 2,
    },
  ],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  applyPreset: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/trpc", () => {
  const mutation = (spy: (input?: unknown) => void) => () => ({
    mutate: spy,
    isPending: false,
  });
  return {
    trpc: {
      useUtils: () => ({
        categories: { list: { invalidate: vi.fn() } },
        products: { invalidate: vi.fn() },
      }),
      categories: {
        list: {
          useQuery: () => ({ data: mocks.categories, isLoading: false }),
        },
        create: { useMutation: mutation(mocks.create) },
        update: { useMutation: mutation(mocks.update) },
        remove: { useMutation: mutation(mocks.remove) },
        reorder: { useMutation: mutation(mocks.reorder) },
        applyPreset: { useMutation: mutation(mocks.applyPreset) },
      },
    },
  };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("admin Categories page", () => {
  it("lists the store's categories with their translated labels", () => {
    render(<Categories />);
    expect(screen.getByText("Bowls")).toBeTruthy();
    expect(screen.getByText(/DE: Schalen/)).toBeTruthy();
    expect(screen.getByText(/FR: Bols/)).toBeTruthy();
    expect(screen.getByText(/IT: Altro/)).toBeTruthy();
    expect(screen.getByText(/No translated labels/)).toBeTruthy();
  });

  it("never offers deleting the Other fallback category", () => {
    render(<Categories />);
    expect(screen.queryByLabelText("Delete Bowls")).toBeTruthy();
    expect(screen.queryByLabelText("Delete Other")).toBeNull();
  });

  it("adds a category with an optional German label", () => {
    render(<Categories />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Planters"), {
      target: { value: "Planters" },
    });
    fireEvent.change(screen.getByPlaceholderText("z.B. Übertöpfe"), {
      target: { value: "Übertöpfe" },
    });
    fireEvent.click(screen.getByText("Add category"));
    expect(mocks.create).toHaveBeenCalledWith({
      key: "Planters",
      labelDe: "Übertöpfe",
    });
  });

  it("adds a category with French and Italian labels too", () => {
    render(<Categories />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Planters"), {
      target: { value: "Planters" },
    });
    fireEvent.change(screen.getByPlaceholderText("p.ex. Cache-pots"), {
      target: { value: "Cache-pots" },
    });
    fireEvent.change(screen.getByPlaceholderText("ad es. Portavasi"), {
      target: { value: "Portavasi" },
    });
    fireEvent.click(screen.getByText("Add category"));
    expect(mocks.create).toHaveBeenCalledWith({
      key: "Planters",
      labelFr: "Cache-pots",
      labelIt: "Portavasi",
    });
  });

  it("renames a key through the edit form", () => {
    render(<Categories />);
    fireEvent.click(screen.getByLabelText("Edit Bowls"));
    fireEvent.change(screen.getByLabelText("Name (key)"), {
      target: { value: "Serving Bowls" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ key: "Bowls", newKey: "Serving Bowls" }),
    );
  });

  it("deleting asks where products go, then sends reassignTo", () => {
    render(<Categories />);
    fireEvent.click(screen.getByLabelText("Delete Bowls"));
    // Reassign target defaults to the first other category ("Vases").
    fireEvent.click(screen.getByText("Delete"));
    expect(mocks.remove).toHaveBeenCalledWith({
      key: "Bowls",
      reassignTo: "Vases",
    });
  });

  it("moves a category down one position via reorder", () => {
    render(<Categories />);
    fireEvent.click(screen.getByLabelText("Move Bowls down"));
    expect(mocks.reorder).toHaveBeenCalledWith({
      keys: ["Vases", "Bowls", "Other"],
    });
  });

  it("offers re-applying the vertical preset", () => {
    render(<Categories />);
    fireEvent.click(screen.getByText("Add missing preset categories"));
    expect(mocks.applyPreset).toHaveBeenCalled();
  });
});
