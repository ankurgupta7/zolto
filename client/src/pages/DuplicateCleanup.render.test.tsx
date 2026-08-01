import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  within,
} from "@testing-library/react";
import { toast } from "sonner";
import DuplicateCleanup from "./DuplicateCleanup";

type MergeOpts = {
  onSuccess?: (result: { removed: number }) => void;
  onError?: (e: Error) => void;
};

const product = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Silver Ring",
  price: "120",
  quantity: 1,
  visible: true,
  imageUrl: null,
  ...extra,
});

const mocks = vi.hoisted(() => ({
  authState: {
    user: { role: "admin" } as { role: string } | null,
    isAuthenticated: true,
    loading: false,
  },
  groups: [] as Record<string, unknown>[] | undefined,
  isLoading: false,
  refetch: vi.fn(),
  merge: vi.fn(),
  mergeOpts: null as MergeOpts | null,
  adminListInvalidate: vi.fn(),
  listInvalidate: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      products: {
        adminList: { invalidate: mocks.adminListInvalidate },
        list: { invalidate: mocks.listInvalidate },
      },
    }),
    products: {
      findDuplicates: {
        useQuery: () => ({
          data: mocks.groups,
          isLoading: mocks.isLoading,
          refetch: mocks.refetch,
        }),
      },
      mergeDuplicates: {
        useMutation: (opts: MergeOpts) => {
          mocks.mergeOpts = opts;
          return { mutate: mocks.merge, isPending: false };
        },
      },
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
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.authState.isAuthenticated = true;
  mocks.authState.loading = false;
  mocks.isLoading = false;
  mocks.mergeOpts = null;
  mocks.groups = [
    {
      key: "silver ring",
      suggestedKeepId: 1,
      products: [product(1, { imageUrl: "https://img/1.jpg" }), product(2)],
    },
    {
      key: "gold hoop",
      suggestedKeepId: 5,
      products: [
        product(5, { name: "Gold Hoop", price: "80" }),
        product(6, { name: "Gold Hoop", price: "80", visible: false }),
        product(7, { name: "Gold Hoop", price: "85" }),
      ],
    },
  ];
});
afterEach(() => cleanup());

describe("DuplicateCleanup: auth guards", () => {
  it("shows a spinner while auth is resolving", () => {
    mocks.authState.loading = true;
    const { container } = render(<DuplicateCleanup />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("prompts sign-in when unauthenticated, offering every method", () => {
    mocks.authState.isAuthenticated = false;
    mocks.authState.user = null;
    render(<DuplicateCleanup />);
    screen.getByText("Admin Required");
    screen.getByRole("link", { name: /continue with google/i });
    screen.getByRole("link", { name: /continue with apple/i });
    screen.getByRole("button", { name: /continue with email/i });
  });

  it("denies access to a signed-in non-admin", () => {
    mocks.authState.user = { role: "staff" };
    render(<DuplicateCleanup />);
    screen.getByText("Access Denied");
  });
});

describe("DuplicateCleanup: listing", () => {
  it("shows a spinner while duplicates are loading", () => {
    mocks.isLoading = true;
    mocks.groups = undefined;
    const { container } = render(<DuplicateCleanup />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("celebrates when there are no duplicates", () => {
    mocks.groups = [];
    render(<DuplicateCleanup />);
    expect(screen.getByText("No duplicate product names found")).toBeTruthy();
  });

  it("lists each group with its copies and preselects the suggested keeper", () => {
    render(<DuplicateCleanup />);
    expect(screen.getByText(/duplicate groups found/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("(2 copies)")).toBeTruthy();
    expect(screen.getByText("(3 copies)")).toBeTruthy();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(5);
    // Suggested keepers (#1 and #5) come pre-checked.
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(radios[2].checked).toBe(true);
  });

  it("refetches on Refresh", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getByText("Refresh"));
    expect(mocks.refetch).toHaveBeenCalled();
  });
});

describe("DuplicateCleanup: confirm-and-merge flow", () => {
  it("opens the review dialog listing everything but the kept copy", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getAllByText("Delete the rest")[0]);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Confirm deleting duplicates"),
    ).toBeTruthy();
    expect(within(dialog).getByText(/#2/)).toBeTruthy();
    expect(within(dialog).queryByText(/#1/)).toBeNull();
  });

  it("respects a changed radio selection when building the dialog", () => {
    render(<DuplicateCleanup />);
    // Keep #2 instead of the suggested #1 — so #1 becomes the deletion.
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(screen.getAllByText("Delete the rest")[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/#1/)).toBeTruthy();
    expect(within(dialog).queryByText(/#2/)).toBeNull();
  });

  it("merges the confirmed ids and reports the result", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getAllByText("Delete the rest")[0]);
    fireEvent.click(screen.getByText(/Confirm 1 Deletion/));
    expect(mocks.merge).toHaveBeenCalledWith({ ids: [2] });

    act(() => mocks.mergeOpts!.onSuccess!({ removed: 1 }));
    expect(toast.success).toHaveBeenCalledWith("Removed 1 duplicate product");
    expect(mocks.adminListInvalidate).toHaveBeenCalled();
    expect(mocks.listInvalidate).toHaveBeenCalled();
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("collects the non-kept copies of every group for Delete All", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getByText("Delete All Duplicates"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/#2/)).toBeTruthy();
    expect(within(dialog).getByText(/#6/)).toBeTruthy();
    expect(within(dialog).getByText(/#7/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Confirm 3 Deletions/));
    expect(mocks.merge).toHaveBeenCalledWith({ ids: [2, 6, 7] });
  });

  it("lets a deselected item escape the deletion", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getByText("Delete All Duplicates"));
    const dialog = screen.getByRole("dialog");
    // Uncheck #6 in the review list before confirming.
    const row = within(dialog).getByText(/#6/).closest("label")!;
    fireEvent.click(within(row as HTMLElement).getByRole("checkbox"));
    fireEvent.click(screen.getByText(/Confirm 2 Deletions/));
    expect(mocks.merge).toHaveBeenCalledWith({ ids: [2, 7] });
  });

  it("backs out via Cancel without writing anything", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getByText("Delete All Duplicates"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.merge).not.toHaveBeenCalled();
  });

  it("surfaces a merge failure as a toast", () => {
    render(<DuplicateCleanup />);
    fireEvent.click(screen.getAllByText("Delete the rest")[0]);
    fireEvent.click(screen.getByText(/Confirm 1 Deletion/));
    act(() => mocks.mergeOpts!.onError!(new Error("merge exploded")));
    expect(toast.error).toHaveBeenCalledWith("merge exploded");
  });
});
