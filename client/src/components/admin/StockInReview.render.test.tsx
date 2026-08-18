import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import StockInReview from "./StockInReview";

/**
 * Render tests for the approval gate.
 *
 * Two behaviours here are load-bearing rather than cosmetic:
 *
 *  - Approve is unreachable until a review has produced a fingerprint, and
 *    unreachable again after a conflict. If the button could fire without one,
 *    the server's staleness check would be the only thing between an approval
 *    and rows nobody looked at.
 *  - A rejected row is displayed. It stays in the merchant's sheet, and the
 *    person approving is the only one in a position to tell them it is there.
 */

type Handlers = {
  onSuccess?: (data: unknown) => void;
  onError?: (err: { message: string }) => void;
};

const mocks = vi.hoisted(() => ({
  previewMutate: vi.fn(),
  applyMutate: vi.fn(),
  previewHandlers: {} as Handlers,
  applyHandlers: {} as Handlers,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    stockIn: {
      preview: {
        useMutation: (opts: Handlers) => {
          mocks.previewHandlers = opts;
          return { mutate: mocks.previewMutate, isPending: false };
        },
      },
      applyChanges: {
        useMutation: (opts: Handlers) => {
          mocks.applyHandlers = opts;
          return { mutate: mocks.applyMutate, isPending: false };
        },
      },
    },
  },
}));

const OK_ROW = {
  rowNumber: 3,
  productId: 1,
  itemName: "Silver ring",
  quantityDelta: 2,
  quantityBefore: 3,
  quantityAfter: 5,
  newPrice: null,
  priceBefore: "45.00",
  note: "two more from the workshop",
  status: "ok",
};

const REJECTED_ROW = {
  rowNumber: 4,
  productId: 999,
  itemName: "",
  quantityDelta: 0,
  quantityBefore: null,
  quantityAfter: null,
  newPrice: null,
  priceBefore: null,
  note: "",
  status: "unknown_product",
  message: "No product with id 999 in this store",
};

/**
 * Drive the component the way a successful `preview` response would.
 *
 * Wrapped in `act` because the tRPC hook is mocked: nothing else flushes the
 * state update the real onSuccess would trigger inside React's batching.
 */
function deliverPreview(rows: unknown[], hash = "abc123") {
  act(() => {
    mocks.previewHandlers.onSuccess?.({
      rows,
      applicable: rows.filter((r) => (r as { status: string }).status === "ok")
        .length,
      hash,
    });
  });
}

function approveButton(): HTMLButtonElement {
  return screen.getByText(/^Approve/).closest("button") as HTMLButtonElement;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("StockInReview: before a review", () => {
  it("prompts for a review and keeps Approve disabled", () => {
    render(<StockInReview />);
    expect(screen.getByText(/press review/i)).toBeTruthy();
    expect(approveButton().disabled).toBe(true);
  });

  it("reads the sheet when Review is pressed", () => {
    render(<StockInReview />);
    fireEvent.click(screen.getByText(/review the sheet/i));
    expect(mocks.previewMutate).toHaveBeenCalled();
  });
});

describe("StockInReview: an empty tab", () => {
  it("says so rather than showing an empty table", () => {
    render(<StockInReview />);
    deliverPreview([], "");
    expect(screen.getByText(/nothing to approve/i)).toBeTruthy();
    expect(approveButton().disabled).toBe(true);
  });
});

describe("StockInReview: a reviewed diff", () => {
  it("shows before → after alongside the delta", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW]);

    expect(screen.getByText("Silver ring")).toBeTruthy();

    // Scoped to the stock cell rather than the whole document: the row number
    // is also "3", and a bare getByText would match either.
    const stockCell = screen.getByText("(+2)").closest("td") as HTMLElement;
    // The whole reason the column is a delta: +2 lands on 5, not on 2.
    expect(stockCell.textContent).toContain("3");
    expect(stockCell.textContent).toContain("5");
  });

  it("shows a price change as before → after", () => {
    render(<StockInReview />);
    deliverPreview([
      { ...OK_ROW, quantityDelta: 0, newPrice: "39.90", priceBefore: "45.00" },
    ]);
    expect(screen.getByText("45.00")).toBeTruthy();
    expect(screen.getByText("39.90")).toBeTruthy();
  });

  it("carries the merchant's note through to the approver", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW]);
    expect(screen.getByText("two more from the workshop")).toBeTruthy();
  });

  it("enables Approve and sends back the reviewed fingerprint", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW], "fingerprint-1");
    expect(approveButton().disabled).toBe(false);

    fireEvent.click(approveButton());
    expect(mocks.applyMutate).toHaveBeenCalledWith({ hash: "fingerprint-1" });
  });

  it("shows a rejected row with its reason, and excludes it from the count", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW, REJECTED_ROW]);

    expect(screen.getByText(/1 row set aside/i)).toBeTruthy();
    expect(
      screen.getByText(/No product with id 999 in this store/),
    ).toBeTruthy();
    // One applicable row, not two.
    expect(screen.getByText("Approve 1 change")).toBeTruthy();
  });

  it("notes rows that already match rather than hiding them", () => {
    render(<StockInReview />);
    deliverPreview([{ ...OK_ROW, status: "no_change" }], "");
    expect(screen.getByText(/already match/i)).toBeTruthy();
  });
});

describe("StockInReview: after approving", () => {
  it("leaves only the outstanding rows and disables Approve again", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW, REJECTED_ROW]);

    act(() => {
      mocks.applyHandlers.onSuccess?.({
        applied: [{ productId: 1 }],
        remaining: [REJECTED_ROW],
      });
    });

    // The approved row is gone; the one the merchant must fix is still shown.
    expect(screen.queryByText("Silver ring")).toBeNull();
    expect(screen.getByText(/1 row set aside/i)).toBeTruthy();
    // No fingerprint left, so the same approval cannot be replayed.
    expect(approveButton().disabled).toBe(true);
  });

  /**
   * A conflict means the merchant typed more while the diff was on screen. The
   * only route forward is a fresh review, so the stale fingerprint is dropped.
   */
  it("drops the fingerprint when the server reports a conflict", () => {
    render(<StockInReview />);
    deliverPreview([OK_ROW], "fingerprint-1");
    expect(approveButton().disabled).toBe(false);

    act(() => {
      mocks.applyHandlers.onError?.({
        message: "The Stock In tab changed since this was reviewed.",
      });
    });
    expect(approveButton().disabled).toBe(true);
  });
});
