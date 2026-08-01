import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { toast } from "sonner";
import Admin from "./Admin";

// jsdom ships none of these; Radix (dialog/select) expects them.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const mocks = vi.hoisted(() => ({
  authState: {
    user: { id: 1, role: "admin" } as { id: number; role: string } | null,
    isAuthenticated: true,
    loading: false,
  },
  productsData: undefined as Record<string, unknown>[] | undefined,
  adminListInvalidate: vi.fn(),
  listInvalidate: vi.fn(),
  previewTranslateMutate: vi.fn(),
  translateProposals: [] as Record<string, unknown>[],
  applyTranslateMutate: vi.fn(),
  applyTranslateResult: { updated: 0 },
  previewRecatMutate: vi.fn(),
  recatProposals: [] as Record<string, unknown>[],
  applyRecatMutate: vi.fn(),
  applyRecatResult: { updated: 0 },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/trpc", () => {
  type MutOpts = { onSuccess?: (data: unknown, input?: unknown) => void };
  // Records the input and settles synchronously with `result()`, so the
  // page's onSuccess handlers (dialog open/close, toasts) run in-test.
  const mutation =
    (spy: (input?: unknown) => void, result: () => unknown = () => undefined) =>
    (opts?: MutOpts) => ({
      mutate: (input?: unknown) => {
        spy(input);
        opts?.onSuccess?.(result(), input);
      },
      mutateAsync: async (input?: unknown) => {
        spy(input);
        const r = result();
        opts?.onSuccess?.(r, input);
        return r;
      },
      isPending: false,
    });
  return {
    trpc: {
      useUtils: () => ({
        products: {
          adminList: { invalidate: mocks.adminListInvalidate },
          list: { invalidate: mocks.listInvalidate },
          getImages: { invalidate: vi.fn() },
        },
        tenant: {
          getStripeConnectUrl: { invalidate: vi.fn() },
          onboardingStatus: { invalidate: vi.fn() },
        },
        billing: {
          getStatus: { invalidate: vi.fn() },
          photoCreditHistory: { invalidate: vi.fn() },
        },
        instagram: { list: { invalidate: vi.fn() } },
      }),
      products: {
        adminList: {
          useQuery: () => ({ data: mocks.productsData, isLoading: false }),
        },
        getBulkLogs: { useQuery: () => ({ data: [], isLoading: false }) },
        getImages: { useQuery: () => ({ data: [], isLoading: false }) },
        create: { useMutation: mutation(vi.fn()) },
        update: { useMutation: mutation(vi.fn()) },
        delete: { useMutation: mutation(vi.fn()) },
        setQuantity: { useMutation: mutation(vi.fn()) },
        toggleVisibility: { useMutation: mutation(vi.fn()) },
        checkDuplicate: {
          useMutation: mutation(vi.fn(), () => ({ duplicates: [] })),
        },
        insights: { useMutation: mutation(vi.fn()) },
        previewAutoTranslateAll: {
          useMutation: mutation(mocks.previewTranslateMutate, () => ({
            proposals: mocks.translateProposals,
          })),
        },
        applyAutoTranslateAll: {
          useMutation: mutation(
            mocks.applyTranslateMutate,
            () => mocks.applyTranslateResult,
          ),
        },
        previewRecategorizeAll: {
          useMutation: mutation(mocks.previewRecatMutate, () => ({
            proposals: mocks.recatProposals,
          })),
        },
        applyRecategorizeAll: {
          useMutation: mutation(
            mocks.applyRecatMutate,
            () => mocks.applyRecatResult,
          ),
        },
        translateProductLocales: { useMutation: mutation(vi.fn()) },
        addImage: { useMutation: mutation(vi.fn()) },
        deleteImage: { useMutation: mutation(vi.fn()) },
      },
      tenant: {
        getStripeConnectUrl: {
          useQuery: () => ({
            data: { connected: false, url: null },
            isLoading: false,
          }),
        },
        onboardingStatus: {
          useQuery: () => ({ data: undefined, isLoading: false }),
        },
        dismissOnboarding: { useMutation: mutation(vi.fn()) },
      },
      reconciliation: {
        run: { useMutation: mutation(vi.fn()) },
        runPos: { useMutation: mutation(vi.fn()) },
      },
      billing: {
        getStatus: { useQuery: () => ({ data: undefined }) },
        generateProductPhoto: { useMutation: mutation(vi.fn()) },
      },
      insights: {
        summary: { useQuery: () => ({ data: undefined, isLoading: false }) },
        narrative: { useQuery: () => ({ data: undefined, isLoading: false }) },
      },
      instagram: {
        list: { useQuery: () => ({ data: [], isLoading: false }) },
        add: { useMutation: mutation(vi.fn()) },
        delete: { useMutation: mutation(vi.fn()) },
      },
      auth: {
        requestMagicLink: {
          useMutation: () => ({
            mutate: vi.fn(),
            isPending: false,
            isError: false,
          }),
        },
      },
    },
  };
});

function makeProduct(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Silberring",
    nameEn: null,
    nameDe: null,
    nameFr: null,
    nameIt: null,
    description: "Ein Ring aus Silber",
    descriptionEn: null,
    descriptionDe: null,
    descriptionFr: null,
    descriptionIt: null,
    price: "120.00",
    category: "Rings",
    imageUrl: null,
    visible: true,
    sold: false,
    quantity: 2,
    source: "manual",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { id: 1, role: "admin" };
  mocks.authState.isAuthenticated = true;
  mocks.authState.loading = false;
  mocks.productsData = [
    makeProduct(),
    makeProduct({
      id: 2,
      name: "Bernsteinkette",
      category: "Necklaces",
      price: "240.00",
      quantity: 1,
    }),
    makeProduct({
      id: 3,
      name: "Alte Brosche",
      category: "Other",
      price: "45.00",
      quantity: 1,
    }),
  ];
  mocks.translateProposals = [];
  mocks.recatProposals = [];
  window.history.replaceState({}, "", "/admin");
  // Keep the auto-starting guided tour overlay out of the way.
  localStorage.setItem("zolto.tour.admin-v1", "done");
});
afterEach(() => cleanup());

describe("Admin page — auto-translate review dialog", () => {
  it("reports directly when nothing needs translating", () => {
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Auto-Translate" }));
    expect(mocks.previewTranslateMutate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "All products already have English translations.",
    );
    expect(screen.queryByText("Review translations")).toBeNull();
  });

  it("applies only the proposals left selected", () => {
    mocks.translateProposals = [
      {
        id: 1,
        name: "Silberring",
        nameEn: "Silver ring",
        descriptionEn: "A ring",
      },
      {
        id: 2,
        name: "Bernsteinkette",
        nameEn: "Amber necklace",
        descriptionEn: "A necklace",
      },
    ];
    mocks.applyTranslateResult = { updated: 1 };
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Auto-Translate" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Review translations")).toBeTruthy();
    expect(within(dialog).getByText('Silberring → "Silver ring"')).toBeTruthy();

    // Everything starts selected; deselect the necklace.
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes.length).toBe(2);
    fireEvent.click(boxes[1]);
    expect(within(dialog).getByText(/1 of 2 selected/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Confirm 1/ }));
    expect(mocks.applyTranslateMutate).toHaveBeenCalledWith({
      items: [{ id: 1, nameEn: "Silver ring", descriptionEn: "A ring" }],
    });
    expect(toast.success).toHaveBeenCalledWith(
      "1 product translated to English.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling the review applies nothing", () => {
    mocks.translateProposals = [
      {
        id: 1,
        name: "Silberring",
        nameEn: "Silver ring",
        descriptionEn: "A ring",
      },
    ];
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Auto-Translate" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.applyTranslateMutate).not.toHaveBeenCalled();
  });
});

describe("Admin page — re-categorise review dialog", () => {
  it("reports directly when nothing is left in Other", () => {
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Re-Categorise" }));
    expect(mocks.previewRecatMutate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "All uncategorised products were already classified.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies the reviewed category moves", () => {
    mocks.recatProposals = [
      { id: 3, name: "Alte Brosche", from: "Other", to: "Brooches" },
    ];
    mocks.applyRecatResult = { updated: 1 };
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Re-Categorise" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Review category changes")).toBeTruthy();
    expect(
      within(dialog).getByText("Alte Brosche: Other → Brooches"),
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Confirm 1/ }));
    expect(mocks.applyRecatMutate).toHaveBeenCalledWith({
      items: [{ id: 3, category: "Brooches" }],
    });
    expect(toast.success).toHaveBeenCalledWith(
      "1 product re-categorised by body part.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Admin page — sort and category grouping", () => {
  // Radix Select is keyboard-driven in jsdom: open the trigger with Enter,
  // then select an option with Enter on the item.
  async function pickSort(optionLabel: string) {
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    const option = await screen.findByRole("option", { name: optionLabel });
    fireEvent.keyDown(option, { key: "Enter" });
  }

  function visibleProductNames() {
    return screen
      .queryAllByText(/^(Silberring|Bernsteinkette|Alte Brosche)$/)
      .map((el) => el.textContent);
  }

  it("sorts the flat table alphabetically by name", async () => {
    render(<Admin />);
    // Server order ("newest") is preserved by default.
    expect(visibleProductNames()).toEqual([
      "Silberring",
      "Bernsteinkette",
      "Alte Brosche",
    ]);
    await pickSort("By Name (A-Z)");
    await waitFor(() =>
      expect(visibleProductNames()).toEqual([
        "Alte Brosche",
        "Bernsteinkette",
        "Silberring",
      ]),
    );
  });

  it("groups by category with working expand/collapse", async () => {
    render(<Admin />);
    await pickSort("By Category");

    // Category group headers appear with their counts (accessible name glues
    // the adjacent spans, so match loosely).
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Necklaces\s*\(1\)/ }),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /^Rings\s*\(1\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Other\s*\(1\)/ })).toBeTruthy();
    expect(screen.getByText("Silberring")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse All" }));
    expect(visibleProductNames()).toEqual([]);

    // Re-open a single group via its header.
    fireEvent.click(screen.getByRole("button", { name: /^Rings\s*\(1\)/ }));
    expect(visibleProductNames()).toEqual(["Silberring"]);

    fireEvent.click(screen.getByRole("button", { name: "Expand All" }));
    expect(visibleProductNames().length).toBe(3);
  });
});
