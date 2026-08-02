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

// jsdom ships none of these; Radix (dialog/select) and the insights
// scroll-to-panel handler expect them.
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
  productsLoading: false,
  bulkLogs: [] as Record<string, unknown>[],
  bulkLogsLoading: false,
  stripeConnectQuery: {
    data: { connected: false, url: null } as {
      connected: boolean;
      url: string | null;
    },
    isLoading: false,
  },
  adminListInvalidate: vi.fn(),
  listInvalidate: vi.fn(),
  stripeConnectInvalidate: vi.fn(),
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
  setQuantityMutate: vi.fn(),
  toggleVisibilityMutate: vi.fn(),
  checkDuplicateMutate: vi.fn(),
  checkDuplicateResult: { duplicates: [] as Record<string, unknown>[] },
  insightsMutate: vi.fn(),
  insightsResult: {
    highlights: ["Necklaces are selling fast"],
    recommendations: ["Restock silver rings"],
    topCategory: "Necklaces",
    slowMovers: ["Alte Brosche"],
  },
  previewTranslateMutate: vi.fn(),
  translateProposals: [] as Record<string, unknown>[],
  applyTranslateMutate: vi.fn(),
  applyTranslateResult: { updated: 0 },
  previewRecatMutate: vi.fn(),
  recatProposals: [] as Record<string, unknown>[],
  applyRecatMutate: vi.fn(),
  applyRecatResult: { updated: 0 },
  translateLocalesMutate: vi.fn(),
  translateLocalesResult: { skipped: false },
  reconcileMutate: vi.fn(),
  reconcileResult: {
    newPendingReview: 0,
    newNoCandidates: 0,
    scannedSucceededPayments: 4,
    emailSent: false,
  },
  posMutate: vi.fn(),
  posResult: {
    newPendingReview: 0,
    newNoCandidates: 0,
    scannedLines: 2,
    emailSent: false,
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/trpc", () => {
  type MutOpts = {
    onSuccess?: (data: unknown, input?: unknown) => void;
    onError?: (err: unknown) => void;
  };
  // Records the input and settles synchronously with `result()`, so the
  // page's onSuccess handlers (refetch, toasts, dialog state) run in-test.
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
          getStripeConnectUrl: { invalidate: mocks.stripeConnectInvalidate },
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
          useQuery: () => ({
            data: mocks.productsData,
            isLoading: mocks.productsLoading,
          }),
        },
        getBulkLogs: {
          useQuery: () => ({
            data: mocks.bulkLogs,
            isLoading: mocks.bulkLogsLoading,
          }),
        },
        getImages: { useQuery: () => ({ data: [], isLoading: false }) },
        create: { useMutation: mutation(mocks.createMutate) },
        update: { useMutation: mutation(mocks.updateMutate) },
        delete: { useMutation: mutation(mocks.deleteMutate) },
        setQuantity: { useMutation: mutation(mocks.setQuantityMutate) },
        toggleVisibility: {
          useMutation: mutation(mocks.toggleVisibilityMutate),
        },
        checkDuplicate: {
          useMutation: mutation(
            mocks.checkDuplicateMutate,
            () => mocks.checkDuplicateResult,
          ),
        },
        insights: {
          useMutation: mutation(
            mocks.insightsMutate,
            () => mocks.insightsResult,
          ),
        },
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
        translateProductLocales: {
          useMutation: mutation(
            mocks.translateLocalesMutate,
            () => mocks.translateLocalesResult,
          ),
        },
        addImage: { useMutation: mutation(vi.fn()) },
        deleteImage: { useMutation: mutation(vi.fn()) },
      },
      tenant: {
        getStripeConnectUrl: { useQuery: () => mocks.stripeConnectQuery },
        onboardingStatus: {
          useQuery: () => ({ data: undefined, isLoading: false }),
        },
        dismissOnboarding: { useMutation: mutation(vi.fn()) },
      },
      reconciliation: {
        run: {
          useMutation: mutation(
            mocks.reconcileMutate,
            () => mocks.reconcileResult,
          ),
        },
        runPos: {
          useMutation: mutation(mocks.posMutate, () => mocks.posResult),
        },
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
      // Used by the signed-out state's SignInOptions.
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

// Products carry every locale column the schema has; only some are filled,
// matching real catalogues.
function makeProduct(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Silberring",
    nameEn: "Silver Ring",
    nameDe: null,
    nameFr: "Bague argentée",
    nameIt: null,
    description: "Ein Ring aus Silber",
    descriptionEn: "A silver ring",
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

function fixtureProducts() {
  return [
    makeProduct(),
    makeProduct({
      id: 2,
      name: "Bernsteinkette",
      nameEn: null,
      nameFr: null,
      descriptionEn: null,
      description: "Kette mit Bernstein",
      price: "240.00",
      category: "Necklaces",
      quantity: 1,
      imageUrl: "https://img.example/kette.jpg",
    }),
    makeProduct({
      id: 3,
      name: "Alte Brosche",
      nameEn: "Old Brooch",
      description: "Vintage Brosche",
      price: "45.00",
      category: "Brooches",
      quantity: 0,
      sold: true,
      visible: false,
    }),
  ];
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { id: 1, role: "admin" };
  mocks.authState.isAuthenticated = true;
  mocks.authState.loading = false;
  mocks.productsData = fixtureProducts();
  mocks.productsLoading = false;
  mocks.bulkLogs = [];
  mocks.bulkLogsLoading = false;
  mocks.stripeConnectQuery.data = { connected: false, url: null };
  mocks.stripeConnectQuery.isLoading = false;
  mocks.checkDuplicateResult = { duplicates: [] };
  mocks.translateProposals = [];
  mocks.recatProposals = [];
  mocks.translateLocalesResult = { skipped: false };
  window.history.replaceState({}, "", "/admin");
  // Keep the auto-starting guided tour overlay out of the way.
  localStorage.setItem("zolto.tour.admin-v1", "done");
});
afterEach(() => cleanup());

describe("Admin page — access gate", () => {
  it("shows a spinner while auth is resolving", () => {
    mocks.authState.loading = true;
    const { container } = render(<Admin />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("Catalogue Management")).toBeNull();
  });

  it("offers sign-in in place when signed out", () => {
    mocks.authState.isAuthenticated = false;
    mocks.authState.user = null;
    render(<Admin />);
    expect(screen.getByText("Admin Access")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /continue with google/i }),
    ).toBeTruthy();
    expect(screen.queryByText("Catalogue Management")).toBeNull();
  });

  it("blocks signed-in non-admins", () => {
    mocks.authState.user = { id: 2, role: "customer" };
    render(<Admin />);
    expect(screen.getByText("Access Denied")).toBeTruthy();
    expect(screen.queryByText("Catalogue Management")).toBeNull();
  });

  // Regression: this gate compared against the literal "admin", so promoting a
  // store owner to superadmin locked them out of their own store's admin.
  it("admits the platform owner (superadmin) to the store admin", () => {
    mocks.authState.user = { id: 1, role: "superadmin" };
    render(<Admin />);
    expect(screen.queryByText("Access Denied")).toBeNull();
    expect(screen.getByText("Catalogue Management")).toBeTruthy();
  });
});

describe("Admin page — catalogue list and stats", () => {
  it("shows a spinner while products load", () => {
    mocks.productsData = undefined;
    mocks.productsLoading = true;
    const { container } = render(<Admin />);
    expect(screen.getByText("Catalogue Management")).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText("No products yet")).toBeNull();
  });

  it("shows the empty state and opens the add form from it", () => {
    mocks.productsData = [];
    render(<Admin />);
    expect(screen.getByText("No products yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add First Product" }));
    expect(screen.getByText("Add New Product")).toBeTruthy();
  });

  it("renders rows with locale names, prices, status and computed stats", () => {
    render(<Admin />);
    expect(screen.getByText("Silberring")).toBeTruthy();
    // English name shown as a subtitle when present.
    expect(screen.getByText("Silver Ring")).toBeTruthy();
    expect(screen.getByText("CHF 120.00")).toBeTruthy();
    expect(screen.getByText("CHF 240.00")).toBeTruthy();
    expect(screen.getAllByText("Visible").length).toBe(2);
    expect(screen.getAllByText("Hidden").length).toBe(1);

    const stat = (label: string) =>
      (screen.getByText(label).parentElement as HTMLElement).textContent;
    expect(stat("Total Products")).toContain("3");
    expect(stat("In Stock")).toContain("2");
    expect(stat("Sold Out")).toContain("1");
    // 120×2 + 240×1; the sold/out-of-stock brooch is excluded.
    expect(stat("Inventory Value")).toContain("480");
  });

  it("renders bulk upload AI error logs when present", () => {
    mocks.bulkLogs = [
      {
        id: 1,
        createdAt: "2026-07-30T10:00:00Z",
        operation: "extra_image",
        ref: "photo-7.jpg",
        errorMessage: "vision model timed out",
      },
    ];
    render(<Admin />);
    expect(screen.queryByText("No errors recorded yet.")).toBeNull();
    // extra_image is displayed under the shorter "image" badge.
    expect(screen.getByText("image")).toBeTruthy();
    expect(screen.getByText("photo-7.jpg")).toBeTruthy();
    expect(screen.getByText("vision model timed out")).toBeTruthy();
  });

  it("shows an empty message when no bulk logs exist", () => {
    render(<Admin />);
    expect(screen.getByText("No errors recorded yet.")).toBeTruthy();
  });
});

describe("Admin page — product row actions", () => {
  it("toggles visibility with the row's current inverse", () => {
    render(<Admin />);
    fireEvent.click(within(rowFor("Silberring")).getByTitle("Hide product"));
    expect(mocks.toggleVisibilityMutate).toHaveBeenCalledWith({
      id: 1,
      visible: false,
    });
    fireEvent.click(within(rowFor("Alte Brosche")).getByTitle("Show product"));
    expect(mocks.toggleVisibilityMutate).toHaveBeenCalledWith({
      id: 3,
      visible: true,
    });
    expect(mocks.adminListInvalidate).toHaveBeenCalled();
  });

  it("requires a confirm step before deleting", () => {
    render(<Admin />);
    const row = rowFor("Silberring");
    fireEvent.click(within(row).getByTitle("Delete product"));
    // Backing out never mutates.
    fireEvent.click(within(row).getByText("No"));
    expect(mocks.deleteMutate).not.toHaveBeenCalled();
    expect(within(row).queryByText("Del")).toBeNull();

    fireEvent.click(within(row).getByTitle("Delete product"));
    fireEvent.click(within(row).getByText("Del"));
    expect(mocks.deleteMutate).toHaveBeenCalledWith({ id: 1 });
    expect(toast.success).toHaveBeenCalledWith("Product deleted");
  });

  it("steps quantity with the +/− buttons", () => {
    render(<Admin />);
    const row = rowFor("Silberring");
    fireEvent.click(within(row).getByRole("button", { name: "+" }));
    expect(mocks.setQuantityMutate).toHaveBeenCalledWith({
      id: 1,
      quantity: 3,
    });
    fireEvent.click(within(row).getByRole("button", { name: "−" }));
    expect(mocks.setQuantityMutate).toHaveBeenCalledWith({
      id: 1,
      quantity: 2,
    });
  });

  it("commits a typed quantity on blur and rejects invalid input", () => {
    render(<Admin />);
    const row = rowFor("Silberring");
    const input = row.querySelector("input[type=number]") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    expect(mocks.setQuantityMutate).toHaveBeenCalledWith({
      id: 1,
      quantity: 7,
    });

    mocks.setQuantityMutate.mockClear();
    fireEvent.change(input, { target: { value: "-3" } });
    fireEvent.blur(input);
    expect(mocks.setQuantityMutate).not.toHaveBeenCalled();
    expect(input.value).toBe("2");
  });

  it("prefills the inline edit form and saves a trimmed update", () => {
    render(<Admin />);
    fireEvent.click(within(rowFor("Silberring")).getByTitle("Edit product"));
    const name = screen.getByLabelText("Name (DE) *") as HTMLInputElement;
    expect(name.value).toBe("Silberring");
    expect((screen.getByLabelText("Name (EN)") as HTMLInputElement).value).toBe(
      "Silver Ring",
    );
    expect(
      (screen.getByLabelText("Price (CHF) *") as HTMLInputElement).value,
    ).toBe("120.00");

    fireEvent.change(name, { target: { value: "  Neuer Ring  " } });
    // Blank EN name is stored as null, not empty string.
    fireEvent.change(screen.getByLabelText("Name (EN)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Price (CHF) *"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText("Category *"), {
      target: { value: "Earrings" },
    });
    fireEvent.change(screen.getByLabelText("Description (EN)"), {
      target: { value: "A new ring" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(mocks.updateMutate).toHaveBeenCalledWith({
      id: 1,
      name: "Neuer Ring",
      nameEn: null,
      description: "Ein Ring aus Silber",
      descriptionEn: "A new ring",
      price: 150,
      category: "Earrings",
    });
    expect(toast.success).toHaveBeenCalledWith("Product updated");
    // Save success closes the inline editor.
    expect(screen.queryByLabelText("Name (DE) *")).toBeNull();
  });

  it("validates the edit form before mutating", () => {
    render(<Admin />);
    fireEvent.click(within(rowFor("Silberring")).getByTitle("Edit product"));
    fireEvent.change(screen.getByLabelText("Name (DE) *"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(toast.error).toHaveBeenCalledWith(
      "Name and description are required",
    );

    fireEvent.change(screen.getByLabelText("Name (DE) *"), {
      target: { value: "Silberring" },
    });
    fireEvent.change(screen.getByLabelText("Price (CHF) *"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByText("Save"));
    expect(toast.error).toHaveBeenCalledWith("Enter a valid price");
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });

  it("cancels an edit without saving", () => {
    render(<Admin />);
    fireEvent.click(within(rowFor("Silberring")).getByTitle("Edit product"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByLabelText("Name (DE) *")).toBeNull();
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });
});

describe("Admin page — add product", () => {
  function openAndFillForm(container: HTMLElement) {
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    fireEvent.change(screen.getByLabelText(/^Name \*/), {
      target: { value: "Mondstein Ohrringe" },
    });
    fireEvent.change(screen.getByLabelText(/^Price \(CHF\)/), {
      target: { value: "185.50" },
    });
    fireEvent.change(screen.getByLabelText(/^Category/), {
      target: { value: "Earrings" },
    });
    fireEvent.change(screen.getByLabelText(/^Quantity/), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: "Zarte Ohrringe mit Mondstein" },
    });
    return container.querySelector("form") as HTMLFormElement;
  }

  it("checks for duplicates, then creates with parsed values", async () => {
    const { container } = render(<Admin />);
    fireEvent.submit(openAndFillForm(container));
    await waitFor(() =>
      expect(mocks.checkDuplicateMutate).toHaveBeenCalledWith({
        name: "Mondstein Ohrringe",
        description: "Zarte Ohrringe mit Mondstein",
        category: "Earrings",
      }),
    );
    await waitFor(() =>
      expect(mocks.createMutate).toHaveBeenCalledWith({
        name: "Mondstein Ohrringe",
        description: "Zarte Ohrringe mit Mondstein",
        price: 185.5,
        category: "Earrings",
        quantity: 3,
        imageUrl: undefined,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Product added successfully");
    // Success closes the form.
    await waitFor(() =>
      expect(screen.queryByText("Add New Product")).toBeNull(),
    );
  });

  it("halts on a suspected duplicate until Add Anyway", async () => {
    mocks.checkDuplicateResult = {
      duplicates: [
        {
          id: 9,
          name: "Mondstein Ohrringe",
          confidence: "high",
          reason: "same name",
        },
      ],
    };
    const { container } = render(<Admin />);
    fireEvent.submit(openAndFillForm(container));
    await waitFor(() =>
      expect(screen.getByText("Possible duplicate detected")).toBeTruthy(),
    );
    expect(screen.getByText("same name", { exact: false })).toBeTruthy();
    expect(mocks.createMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add Anyway" }));
    await waitFor(() =>
      expect(mocks.createMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Mondstein Ohrringe" }),
      ),
    );
    // A second duplicate check would loop the warning forever.
    expect(mocks.checkDuplicateMutate).toHaveBeenCalledTimes(1);
  });

  it("dismissing the duplicate warning keeps the product uncreated", async () => {
    mocks.checkDuplicateResult = {
      duplicates: [
        {
          id: 9,
          name: "Mondstein Ohrringe",
          confidence: "medium",
          reason: "similar",
        },
      ],
    };
    const { container } = render(<Admin />);
    fireEvent.submit(openAndFillForm(container));
    await waitFor(() =>
      expect(screen.getByText("Possible duplicate detected")).toBeTruthy(),
    );
    // The warning's own Cancel renders before the form-wide one.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(screen.queryByText("Possible duplicate detected")).toBeNull();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it("refuses to submit with required fields missing", async () => {
    const { container } = render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Add Product" }));
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Please fill in all required fields",
      ),
    );
    expect(mocks.checkDuplicateMutate).not.toHaveBeenCalled();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });
});

describe("Admin page — header tools", () => {
  it("runs Stripe payment reconciliation and reports the outcome", () => {
    render(<Admin />);
    fireEvent.click(
      screen.getByRole("button", { name: "Reconcile Stripe Payments" }),
    );
    expect(mocks.reconcileMutate).toHaveBeenCalledWith({});
    expect(toast.success).toHaveBeenCalledWith(
      "No unmatched Stripe payments found (4 checked).",
    );
  });

  it("runs in-person sale attribution and reports the outcome", () => {
    render(<Admin />);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm In-Person Sales" }),
    );
    expect(mocks.posMutate).toHaveBeenCalledWith({});
    expect(toast.success).toHaveBeenCalledWith(
      "No unattributed in-person sales found (2 checked).",
    );
  });

  it("tells the merchant when Stripe Connect is unconfigured", () => {
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Stripe" }));
    expect(toast.error).toHaveBeenCalledWith(
      "Stripe Connect isn't set up on the platform yet. Contact support.",
    );
  });

  it("shows the connected badge instead of the connect button", () => {
    mocks.stripeConnectQuery.data = { connected: true, url: null };
    render(<Admin />);
    expect(screen.getByText("Stripe Connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Stripe" })).toBeNull();
  });

  it("confirms a successful Stripe Connect return and cleans the URL", async () => {
    window.history.replaceState({}, "", "/admin?stripeConnect=success");
    render(<Admin />);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Stripe account connected — online payments are live.",
      ),
    );
    expect(mocks.stripeConnectInvalidate).toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("surfaces a failed Stripe Connect return with its reason", async () => {
    window.history.replaceState(
      {},
      "",
      "/admin?stripeConnect=error&reason=denied",
    );
    render(<Admin />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Stripe connection failed: denied",
      ),
    );
    expect(window.location.search).toBe("");
  });

  it("translates storefront locales product by product", async () => {
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Translate de/en/fr" }));
    await waitFor(() =>
      expect(mocks.translateLocalesMutate).toHaveBeenCalledTimes(3),
    );
    expect(mocks.translateLocalesMutate).toHaveBeenCalledWith({ productId: 1 });
    expect(mocks.translateLocalesMutate).toHaveBeenCalledWith({ productId: 3 });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Translated 3 products into German, English and French.",
      ),
    );
    expect(mocks.adminListInvalidate).toHaveBeenCalled();
  });

  it("reports when every product already has locale translations", async () => {
    mocks.translateLocalesResult = { skipped: true };
    render(<Admin />);
    fireEvent.click(screen.getByRole("button", { name: "Translate de/en/fr" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "All products already have de/en/fr translations.",
      ),
    );
  });
});

describe("Admin page — AI insights", () => {
  it("generates, shows, and hides insights", () => {
    render(<Admin />);
    expect(screen.getByText(/Click "Generate Insights"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate Insights" }));
    expect(mocks.insightsMutate).toHaveBeenCalled();
    expect(screen.getByText("Necklaces are selling fast")).toBeTruthy();
    expect(screen.getByText("Restock silver rings")).toBeTruthy();
    expect(screen.getByText("Top Category")).toBeTruthy();
    expect(screen.getByText("Slow Movers")).toBeTruthy();
    // Once data exists the button becomes a refresh.
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("Necklaces are selling fast")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Necklaces are selling fast")).toBeTruthy();
  });
});
