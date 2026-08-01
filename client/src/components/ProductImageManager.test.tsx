import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { toast } from "sonner";
import ProductImageManager from "./ProductImageManager";

type MutationOpts = {
  onSuccess?: (data?: never) => void;
  onError?: (err: { message?: string }) => void;
};

const mocks = vi.hoisted(() => ({
  imagesData: [] as Array<{ id: number; imageUrl: string }>,
  imagesLoading: false,
  billingStatus: {
    ai: { allowancePerMonth: 5, usedThisMonth: 2 },
  } as
    | { ai: { allowancePerMonth: number | null; usedThisMonth: number | null } }
    | undefined,
  addMutateAsync: vi.fn(),
  deleteMutate: vi.fn(),
  aiMutate: vi.fn(),
  aiOpts: null as {
    onSuccess?: (data: { remainingThisMonth: number | null }) => void;
    onError?: (err: { message: string }) => void;
  } | null,
  invalidateImages: vi.fn(),
  invalidateStatus: vi.fn(),
  invalidateHistory: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      products: { getImages: { invalidate: mocks.invalidateImages } },
      billing: {
        getStatus: { invalidate: mocks.invalidateStatus },
        photoCreditHistory: { invalidate: mocks.invalidateHistory },
      },
    }),
    products: {
      getImages: {
        useQuery: (
          _input: { productId: number },
          opts?: { enabled?: boolean },
        ) => ({
          data: opts?.enabled ? mocks.imagesData : [],
          isLoading: opts?.enabled ? mocks.imagesLoading : false,
        }),
      },
      addImage: {
        useMutation: () => ({
          mutateAsync: mocks.addMutateAsync,
          isPending: false,
        }),
      },
      deleteImage: {
        useMutation: () => ({ mutate: mocks.deleteMutate, isPending: false }),
      },
    },
    billing: {
      getStatus: {
        useQuery: (_input: undefined, opts?: { enabled?: boolean }) => ({
          data: opts?.enabled ? mocks.billingStatus : undefined,
        }),
      },
      generateProductPhoto: {
        useMutation: (opts: typeof mocks.aiOpts) => {
          mocks.aiOpts = opts;
          return { mutate: mocks.aiMutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const AI_STYLE_DEFAULT =
  "Clean catalogue shot on a seamless white background, soft studio light";

function expand() {
  fireEvent.click(screen.getByText(/Manage Extra Images/));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imagesData = [];
  mocks.imagesLoading = false;
  mocks.billingStatus = { ai: { allowancePerMonth: 5, usedThisMonth: 2 } };
  mocks.addMutateAsync.mockResolvedValue({});
});
afterEach(() => cleanup());

describe("ProductImageManager", () => {
  it("stays collapsed until toggled, then expands and collapses again", () => {
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expect(screen.queryByText(/Extra images for/)).toBeNull();
    expand();
    expect(screen.getByText("Silver Ring")).toBeTruthy();
    expect(screen.getByText(/No extra images yet/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Hide Extra Images/));
    expect(screen.queryByText(/Extra images for/)).toBeNull();
  });

  it("deletes an image via its overlay button", () => {
    mocks.imagesData = [{ id: 11, imageUrl: "https://cdn.example/a.jpg" }];
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expand();
    fireEvent.click(screen.getByLabelText("Remove image"));
    expect(mocks.deleteMutate).toHaveBeenCalledWith({ imageId: 11 });
  });

  it("uploads a file as a data URL with the next sortOrder", async () => {
    mocks.imagesData = [{ id: 11, imageUrl: "https://cdn.example/a.jpg" }];
    const { container } = render(
      <ProductImageManager productId={3} productName="Silver Ring" />,
    );
    expand();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["pixels"], "extra.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mocks.addMutateAsync).toHaveBeenCalled());
    expect(mocks.addMutateAsync).toHaveBeenCalledWith({
      productId: 3,
      imageData: expect.stringMatching(/^data:image\/png;base64,/),
      mimeType: "image/png",
      sortOrder: 1,
    });
  });

  it("rejects files over 8 MB without uploading", async () => {
    const { container } = render(
      <ProductImageManager productId={3} productName="Silver Ring" />,
    );
    expand();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const big = new File([new ArrayBuffer(9 * 1024 * 1024)], "huge.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(input, { target: { files: [big] } });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "huge.jpg is too large (max 8 MB)",
      ),
    );
    expect(mocks.addMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the remaining Free-plan allowance and generates with the chosen style", () => {
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expand();
    expect(screen.getByText("3 shots left this month")).toBeTruthy();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const secondStyle = select.options[1].value;
    fireEvent.change(select, { target: { value: secondStyle } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(mocks.aiMutate).toHaveBeenCalledWith({
      productId: 3,
      stylePrompt: secondStyle,
    });
    expect(secondStyle).not.toBe(AI_STYLE_DEFAULT);
  });

  it("disables Generate and shows the upgrade hint when the allowance is used up", () => {
    mocks.billingStatus = { ai: { allowancePerMonth: 5, usedThisMonth: 5 } };
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expand();
    const generate = screen.getByRole("button", {
      name: /generate/i,
    }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.click(generate);
    expect(mocks.aiMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Allowance used for this month/)).toBeTruthy();
  });

  it("hides the counter entirely on an unmetered (Pro) plan", () => {
    mocks.billingStatus = {
      ai: { allowancePerMonth: null, usedThisMonth: null },
    };
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expand();
    expect(screen.queryByText(/left this month/)).toBeNull();
  });

  it("invalidates caches and toasts the remaining count after AI success", () => {
    render(<ProductImageManager productId={3} productName="Silver Ring" />);
    expand();
    act(() => mocks.aiOpts?.onSuccess?.({ remainingThisMonth: 2 }));
    expect(mocks.invalidateImages).toHaveBeenCalledWith({ productId: 3 });
    expect(mocks.invalidateStatus).toHaveBeenCalled();
    expect(mocks.invalidateHistory).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "AI photo added — 2 left this month",
    );
    act(() => mocks.aiOpts?.onSuccess?.({ remainingThisMonth: null }));
    expect(toast.success).toHaveBeenCalledWith("AI photo added");
  });
});
