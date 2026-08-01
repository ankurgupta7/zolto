import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { toast } from "sonner";
import InstagramManager from "./InstagramManager";

type MutationOpts = {
  onSuccess?: (data?: unknown) => void;
  onError?: (err: { message?: string }) => void;
};

const mocks = vi.hoisted(() => ({
  addMutate: vi.fn(),
  deleteMutate: vi.fn(),
  invalidate: vi.fn(),
  addOpts: null as MutationOpts | null,
  deleteOpts: null as MutationOpts | null,
  addPending: false,
  posts: [] as Array<{ id: number; postUrl: string }> | undefined,
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      instagram: { list: { invalidate: mocks.invalidate } },
    }),
    instagram: {
      list: {
        useQuery: () => ({ data: mocks.posts, isLoading: mocks.isLoading }),
      },
      add: {
        useMutation: (opts: MutationOpts) => {
          mocks.addOpts = opts;
          return { mutate: mocks.addMutate, isPending: mocks.addPending };
        },
      },
      delete: {
        useMutation: (opts: MutationOpts) => {
          mocks.deleteOpts = opts;
          return { mutate: mocks.deleteMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.posts = [];
  mocks.isLoading = false;
  mocks.addPending = false;
});
afterEach(() => cleanup());

describe("InstagramManager", () => {
  it("shows the loading state", () => {
    mocks.isLoading = true;
    mocks.posts = undefined;
    render(<InstagramManager />);
    expect(screen.getByText("Loading posts…")).toBeTruthy();
  });

  it("shows the empty state when no posts exist", () => {
    render(<InstagramManager />);
    expect(screen.getByText(/No posts added yet/)).toBeTruthy();
  });

  it("lists posts with their position and an external link", () => {
    mocks.posts = [
      { id: 1, postUrl: "https://www.instagram.com/p/AAA/" },
      { id: 2, postUrl: "https://www.instagram.com/reel/BBB/" },
    ];
    render(<InstagramManager />);
    expect(screen.getByText("2 posts in grid")).toBeTruthy();
    expect(screen.getByText("https://www.instagram.com/p/AAA/")).toBeTruthy();
    const link = screen.getAllByTitle("Open post")[0] as HTMLAnchorElement;
    expect(link.href).toBe("https://www.instagram.com/p/AAA/");
  });

  it("adds a post with the next sortOrder on submit", () => {
    mocks.posts = [{ id: 1, postUrl: "https://www.instagram.com/p/AAA/" }];
    render(<InstagramManager />);
    fireEvent.change(
      screen.getByPlaceholderText("https://www.instagram.com/p/XXXXX/"),
      { target: { value: "https://www.instagram.com/p/CCC/ " } },
    );
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(mocks.addMutate).toHaveBeenCalledWith({
      postUrl: "https://www.instagram.com/p/CCC/",
      sortOrder: 1,
    });
  });

  it("does not submit a blank URL", () => {
    render(<InstagramManager />);
    fireEvent.submit(
      screen
        .getByPlaceholderText("https://www.instagram.com/p/XXXXX/")
        .closest("form") as HTMLFormElement,
    );
    expect(mocks.addMutate).not.toHaveBeenCalled();
  });

  it("on add success clears the input, invalidates and toasts", () => {
    render(<InstagramManager />);
    const input = screen.getByPlaceholderText(
      "https://www.instagram.com/p/XXXXX/",
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: "https://www.instagram.com/p/DDD/" },
    });
    act(() => mocks.addOpts?.onSuccess?.());
    expect(input.value).toBe("");
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Post added to grid");
  });

  it("surfaces the server message on add failure", () => {
    render(<InstagramManager />);
    act(() => mocks.addOpts?.onError?.({ message: "Not an Instagram URL" }));
    expect(toast.error).toHaveBeenCalledWith("Not an Instagram URL");
  });

  it("removes a post and toasts on success", () => {
    mocks.posts = [{ id: 7, postUrl: "https://www.instagram.com/p/AAA/" }];
    render(<InstagramManager />);
    fireEvent.click(screen.getByTitle("Remove from grid"));
    expect(mocks.deleteMutate).toHaveBeenCalledWith({ id: 7 });
    act(() => mocks.deleteOpts?.onSuccess?.());
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Post removed");
  });
});
