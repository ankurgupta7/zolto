import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import Sheets from "./Sheets";

/**
 * Render tests for the Spreadsheet page.
 *
 * The states worth pinning are the ones a merchant can be stuck in and cannot
 * diagnose: an installation with no Google credentials (the button must not
 * appear at all), and a mirror whose last refresh failed (the reason must be on
 * screen, because the usual causes — they deleted the file, they removed their
 * own access — are only fixable by them).
 *
 * The page's look is verified by screenshot, not here; jsdom lays nothing out.
 */

const mocks = vi.hoisted(() => ({
  status: {
    data: undefined as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  connect: vi.fn(),
  syncNow: vi.fn(),
  setStockIn: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    sheets: {
      status: { useQuery: () => mocks.status },
      connect: {
        useMutation: () => ({ mutate: mocks.connect, isPending: false }),
      },
      syncNow: {
        useMutation: () => ({ mutate: mocks.syncNow, isPending: false }),
      },
      setStockIn: {
        useMutation: () => ({ mutate: mocks.setStockIn, isPending: false }),
      },
      disconnect: {
        useMutation: () => ({ mutate: mocks.disconnect, isPending: false }),
      },
    },
    stockIn: {
      preview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      applyChanges: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

const MIRROR = {
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
  sharedWith: "owner@example.com",
  stockInEnabled: false,
  lastSyncedAt: "2026-08-17T08:00:00.000Z",
  lastSyncError: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = { data: undefined, isLoading: false, refetch: vi.fn() };
});
afterEach(() => cleanup());

describe("Sheets page: unconfigured installation", () => {
  it("says the feature is absent and offers no connect button", () => {
    mocks.status.data = { configured: false, mirror: null };
    render(<Sheets />);

    expect(
      screen.getByText(/not available on this installation/i),
    ).toBeTruthy();
    // Naming the env vars is the point: the person who can fix this is whoever
    // runs the install, and they need to know what to set.
    expect(screen.getByText(/GOOGLE_SERVICE_ACCOUNT_EMAIL/)).toBeTruthy();
    expect(screen.queryByText(/create and share/i)).toBeNull();
  });
});

describe("Sheets page: not yet connected, signed in with Google", () => {
  beforeEach(() => {
    mocks.status.data = {
      configured: true,
      googleAccount: "owner@example.com",
      mirror: null,
    };
  });

  /**
   * The whole point of taking the address from the session: an admin who
   * signed in with Google is asked nothing at all.
   */
  it("names the account it will share with, and asks for nothing", () => {
    render(<Sheets />);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.queryByLabelText(/share with/i)).toBeNull();
    expect(screen.getByText(/create and share/i)).toBeTruthy();
  });

  it("connects with no address in the payload, letting the server decide", () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText(/create and share/i));
    expect(mocks.connect).toHaveBeenCalledWith({});
  });
});

describe("Sheets page: not yet connected, signed in some other way", () => {
  beforeEach(() => {
    // Apple / magic link — Drive can only share to a Google account, and this
    // address may well not be one, so the field is the honest thing to show.
    mocks.status.data = {
      configured: true,
      googleAccount: null,
      mirror: null,
    };
  });

  it("asks for a Google address, and says why", () => {
    render(<Sheets />);
    expect(screen.getByLabelText(/share with/i)).toBeTruthy();
    expect(screen.getByText(/only share with a google account/i)).toBeTruthy();
  });

  it("cannot connect until an address is typed", () => {
    render(<Sheets />);
    const button = screen
      .getByText(/create and share/i)
      .closest("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/share with/i), {
      target: { value: "accountant@gmail.com" },
    });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(mocks.connect).toHaveBeenCalledWith({
      shareWith: "accountant@gmail.com",
    });
  });
});

describe("Sheets page: not yet connected", () => {
  beforeEach(() => {
    mocks.status.data = {
      configured: true,
      googleAccount: "owner@example.com",
      mirror: null,
    };
  });

  /**
   * The direction of truth, stated before the merchant has a sheet to
   * misunderstand. Someone who believes the spreadsheet IS their inventory will
   * eventually type an absolute quantity over a sale.
   */
  it("says the sheet reports the ledger rather than driving it", () => {
    render(<Sheets />);
    expect(screen.getByText(/replaced on the next refresh/i)).toBeTruthy();
  });
});

describe("Sheets page: connected", () => {
  beforeEach(() => {
    mocks.status.data = { configured: true, mirror: { ...MIRROR } };
  });

  it("links to the spreadsheet in a new tab, safely", () => {
    render(<Sheets />);
    const link = screen
      .getByText(/open in google sheets/i)
      .closest("a") as HTMLAnchorElement;
    expect(link.href).toBe(MIRROR.spreadsheetUrl);
    expect(link.target).toBe("_blank");
    // Without noopener the opened tab can reach back into this one.
    expect(link.rel).toContain("noopener");
  });

  it("shows who it is shared with and when it last refreshed", () => {
    render(<Sheets />);
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText(/last refreshed/i)).toBeTruthy();
  });

  it("shows a dash rather than a date for a mirror that never synced", () => {
    mocks.status.data = {
      configured: true,
      mirror: { ...MIRROR, lastSyncedAt: null },
    };
    render(<Sheets />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("surfaces the last failure with the reason and what to do", () => {
    mocks.status.data = {
      configured: true,
      mirror: { ...MIRROR, lastSyncError: "File not found: sheet-1" },
    };
    render(<Sheets />);
    expect(screen.getByText(/the last refresh failed/i)).toBeTruthy();
    expect(screen.getByText(/File not found: sheet-1/)).toBeTruthy();
    expect(screen.getByText(/disconnect and create it again/i)).toBeTruthy();
  });

  it("hides the failure banner once a refresh has succeeded", () => {
    render(<Sheets />);
    expect(screen.queryByText(/the last refresh failed/i)).toBeNull();
  });

  it("refreshes and disconnects on demand", () => {
    render(<Sheets />);
    fireEvent.click(screen.getByText(/refresh now/i));
    expect(mocks.syncNow).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/^disconnect$/i));
    expect(mocks.disconnect).toHaveBeenCalled();
  });

  /**
   * "Download a copy first" is only useful advice while the merchant still has
   * access, so it has to be on screen before they press Disconnect — not in the
   * toast afterwards.
   */
  it("warns before the button that disconnecting removes their access", () => {
    render(<Sheets />);
    const hint = screen.getByText(/removes your access to the sheet/i);
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/download a copy first/i);
    // The file survives — disconnecting is a permission change, not a deletion.
    expect(hint.textContent).toMatch(/file itself is kept/i);
  });

  it("says in the merchant's own words that qty_delta is a change", () => {
    render(<Sheets />);
    expect(screen.getByText(/a change, not a total/i)).toBeTruthy();
  });
});

describe("Sheets page: the inbound lane", () => {
  it("is off by default, and the review card is not shown", () => {
    mocks.status.data = { configured: true, mirror: { ...MIRROR } };
    render(<Sheets />);
    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByText(/waiting for your approval/i)).toBeNull();
  });

  it("warns that switching it on grants Google edit access", () => {
    mocks.status.data = { configured: true, mirror: { ...MIRROR } };
    render(<Sheets />);
    expect(screen.getByText(/edit access to the file/i)).toBeTruthy();
  });

  it("turns the lane on through the mutation", () => {
    mocks.status.data = { configured: true, mirror: { ...MIRROR } };
    render(<Sheets />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(mocks.setStockIn).toHaveBeenCalledWith({ enabled: true });
  });

  it("shows the review card once the lane is on", () => {
    mocks.status.data = {
      configured: true,
      mirror: { ...MIRROR, stockInEnabled: true },
    };
    render(<Sheets />);
    expect(screen.getByText(/waiting for your approval/i)).toBeTruthy();
  });
});
