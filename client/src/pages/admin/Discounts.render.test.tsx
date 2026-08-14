import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import Discounts from "./Discounts";

const mocks = vi.hoisted(() => ({
  listData: [] as Record<string, unknown>[],
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ discounts: { list: { invalidate: vi.fn() } } }),
    discounts: {
      list: { useQuery: () => ({ data: mocks.listData, isLoading: false }) },
      create: {
        useMutation: () => ({ mutate: mocks.create, isPending: false }),
      },
      update: {
        useMutation: () => ({ mutate: mocks.update, isPending: false }),
      },
      delete: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

const ROW = {
  id: 5,
  code: "WELCOME10",
  kind: "percent" as const,
  value: 10,
  currency: null,
  campaign: "spring",
  minSubtotalRappen: null,
  maxRedemptions: 50,
  redeemedCount: 3,
  startsAt: null,
  expiresAt: null,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  description: "10% off",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listData = [];
  vi.stubGlobal("navigator", { clipboard: { writeText: mocks.writeText } });
  mocks.writeText.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const createButton = () => screen.getByRole("button", { name: /^Create$/ });

describe("Discounts page — creating", () => {
  it("creates one unlimited percentage code by default", () => {
    render(<Discounts />);
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "percent", value: 10, count: 1 }),
    );
  });

  // A merchant types francs; everything else on the platform counts Rappen.
  it("converts a fixed amount from francs to minor units", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "amount" },
    });
    fireEvent.change(screen.getByLabelText("Amount off"), {
      target: { value: "15" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "amount", value: 1500 }),
    );
  });

  it("converts the basket minimum from francs too", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("Minimum basket"), {
      target: { value: "100" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ minSubtotalRappen: 10_000 }),
    );
  });

  it("refuses a percentage over 100 without calling the server", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("Percent off"), {
      target: { value: "150" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("refuses a discount of zero", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("Percent off"), {
      target: { value: "0" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Fifty codes can't all be called SPRING, so the form swaps the "code" box
  // for a "prefix" box the moment a batch is asked for.
  it("offers a code box for one, and a prefix box for a batch", () => {
    render(<Discounts />);
    expect(screen.getByLabelText("Code")).toBeTruthy();
    expect(screen.queryByLabelText("Prefix")).toBeNull();

    fireEvent.change(screen.getByLabelText("How many"), {
      target: { value: "50" },
    });
    expect(screen.getByLabelText("Prefix")).toBeTruthy();
    expect(screen.queryByLabelText("Code")).toBeNull();
  });

  it("passes a batch prefix through", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("How many"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText("Prefix"), {
      target: { value: "XMAS" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ count: 50, prefix: "XMAS" }),
    );
  });

  it("makes a friends-and-family code single-use", () => {
    render(<Discounts />);
    fireEvent.change(screen.getByLabelText("Uses per code"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Campaign"), {
      target: { value: "friends-family" },
    });
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRedemptions: 1,
        campaign: "friends-family",
      }),
    );
  });

  it("leaves the optional terms null when untouched", () => {
    render(<Discounts />);
    fireEvent.click(createButton());
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign: null,
        maxRedemptions: null,
        minSubtotalRappen: null,
        expiresAt: null,
      }),
    );
  });
});

describe("Discounts page — the list", () => {
  it("shows an empty state before any code exists", () => {
    render(<Discounts />);
    expect(screen.getByText("No codes yet")).toBeTruthy();
  });

  it("shows a code, its terms and how much of its limit is used", () => {
    mocks.listData = [ROW];
    render(<Discounts />);
    expect(screen.getByText("WELCOME10")).toBeTruthy();
    expect(screen.getByText("10% off")).toBeTruthy();
    expect(screen.getByText("3 / 50")).toBeTruthy();
  });

  it("shows a bare count for an unlimited code", () => {
    mocks.listData = [{ ...ROW, maxRedemptions: null, redeemedCount: 7 }];
    render(<Discounts />);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("copies the code itself", async () => {
    mocks.listData = [ROW];
    render(<Discounts />);
    fireEvent.click(screen.getByLabelText("Copy the code WELCOME10"));
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith("WELCOME10"),
    );
  });

  // The share link is the same code with the typing removed — /shop?discount=…
  it("copies a share link that applies the code by itself", async () => {
    mocks.listData = [ROW];
    render(<Discounts />);
    fireEvent.click(screen.getByLabelText("Copy a share link for WELCOME10"));
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/shop?discount=WELCOME10`,
      ),
    );
  });

  it("says so when the clipboard refuses, rather than failing silently", async () => {
    mocks.listData = [ROW];
    mocks.writeText.mockRejectedValue(new Error("denied"));
    render(<Discounts />);
    fireEvent.click(screen.getByLabelText("Copy the code WELCOME10"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("switches a code off without deleting it", () => {
    mocks.listData = [ROW];
    render(<Discounts />);
    fireEvent.click(screen.getByLabelText("Keep WELCOME10 working"));
    expect(mocks.update).toHaveBeenCalledWith({ id: 5, active: false });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes a code", () => {
    mocks.listData = [ROW];
    render(<Discounts />);
    fireEvent.click(screen.getByLabelText("Delete WELCOME10"));
    expect(mocks.remove).toHaveBeenCalledWith({ id: 5 });
  });
});
