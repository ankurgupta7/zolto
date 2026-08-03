import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import BulkUpload from "./BulkUpload";

const authState = {
  user: { id: 1, role: "admin" } as { id: number; role: string } | null,
  isAuthenticated: true,
  loading: false,
};

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      me: { useQuery: () => ({ data: null, isLoading: false }) },
      getSettings: { useQuery: () => ({ data: null, isLoading: false }) },
    },
    categories: {
      list: {
        useQuery: () => ({
          data: [
            "Necklaces",
            "Earrings",
            "Sets",
            "Rings",
            "Bracelets",
            "Bangles",
            "Anklets",
            "Brooches",
            "Hair Accessories",
            "Other",
          ].map((key, i) => ({
            key,
            labelEn: key,
            labelDe: null,
            extraIncludes:
              key === "Necklaces" || key === "Earrings" ? ["Sets"] : [],
            sortOrder: i,
          })),
          isLoading: false,
          error: null,
        }),
      },
    },
    useUtils: () => ({}),
    products: {
      bulkAnalyze: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      bulkCreate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      findMatches: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      bulkUpsertImages: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 1, role: "admin" };
  authState.isAuthenticated = true;
  authState.loading = false;
});
afterEach(() => cleanup());

describe("BulkUpload page — access gate", () => {
  it("blocks signed-in non-admins", () => {
    authState.user = { id: 2, role: "customer" };
    const { container } = render(<BulkUpload />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("admits the platform owner (superadmin)", () => {
    authState.user = { id: 1, role: "superadmin" };
    const { container } = render(<BulkUpload />);
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });
});

describe("BulkUpload page — Step 1 (select photos)", () => {
  it("leads with a camera-capture button ahead of the plain file picker", () => {
    const { container } = render(<BulkUpload />);

    const cameraInput = container.querySelector(
      'input[type="file"][capture="environment"]',
    ) as HTMLInputElement | null;
    expect(cameraInput).toBeTruthy();
    expect(cameraInput?.accept).toBe("image/*");
    expect(cameraInput?.multiple).toBe(false);

    // The plain file picker still exists as the secondary path (desktop,
    // multi-select from an existing gallery/folder).
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(2);
    const filePicker = Array.from(fileInputs).find(
      (el) => (el as HTMLInputElement).multiple,
    ) as HTMLInputElement | undefined;
    expect(filePicker).toBeTruthy();
    expect(filePicker?.getAttribute("capture")).toBeNull();
  });

  it("appends a captured photo to the grid via the camera input", async () => {
    const { container } = render(<BulkUpload />);
    const cameraInput = container.querySelector(
      'input[type="file"][capture="environment"]',
    ) as HTMLInputElement;

    const file = new File(["shot"], "crate-1.jpg", { type: "image/jpeg" });
    Object.defineProperty(cameraInput, "files", {
      value: [file],
      writable: false,
    });
    fireEvent.change(cameraInput);

    // FileReader is async even in jsdom; the captured shot's thumbnail
    // (alt = original filename) appears once it resolves.
    await waitFor(() => {
      expect(screen.getByAltText("crate-1.jpg")).toBeTruthy();
    });
  });
});
