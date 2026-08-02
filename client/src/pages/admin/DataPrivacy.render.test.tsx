import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { toast } from "sonner";
import DataPrivacy from "./DataPrivacy";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  meData: { name: "Bergblume", slug: "bergblume", plan: "free" } as
    | Record<string, unknown>
    | undefined,
  adminListFetch: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      products: { adminList: { fetch: mocks.adminListFetch } },
    }),
    tenant: { me: { useQuery: () => ({ data: mocks.meData }) } },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.meData = { name: "Bergblume", slug: "bergblume", plan: "free" };
});
afterEach(() => cleanup());

describe("DataPrivacy page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<DataPrivacy />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("downloads a JSON export of the catalogue and store profile", async () => {
    // jsdom doesn't implement these, so stub them before spying.
    if (!URL.createObjectURL)
      (URL as unknown as Record<string, unknown>).createObjectURL = () => "";
    if (!URL.revokeObjectURL)
      (URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    let downloadName = "";
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
      });

    mocks.adminListFetch.mockResolvedValue([{ id: 1, name: "Ring" }]);
    render(<DataPrivacy />);
    fireEvent.click(screen.getByText("Download export"));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Export downloaded."),
    );
    expect(mocks.adminListFetch).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloadName).toMatch(/^bergblume-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it("shows an error toast when the export fetch fails", async () => {
    mocks.adminListFetch.mockRejectedValue(new Error("network down"));
    render(<DataPrivacy />);
    fireEvent.click(screen.getByText("Download export"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not build the export. Please try again.",
      ),
    );
  });

  it("warns that deletion is permanent and handled via support", () => {
    render(<DataPrivacy />);
    expect(
      screen.getByText(/Deletion is permanent and can't be undone/),
    ).toBeTruthy();
    expect(screen.getByText("Request deletion")).toBeTruthy();
  });
});
