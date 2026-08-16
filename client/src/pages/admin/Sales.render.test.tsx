import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
  within,
} from "@testing-library/react";
import i18n from "@/lib/i18n";
import Sales from "./Sales";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  data: undefined as unknown,
  isLoading: false,
  lastInput: undefined as unknown,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sales: {
      list: {
        useQuery: (input: unknown) => {
          mocks.lastInput = input;
          return { data: mocks.data, isLoading: mocks.isLoading };
        },
      },
    },
  },
}));

const POS_ROW = {
  key: "pos-9",
  id: 9,
  channel: "pos" as const,
  reference: "KPOS-9",
  createdAt: "2026-08-16T12:14:47.000Z",
  paymentMethod: "cash",
  currency: "chf",
  amountMinor: 15000,
  customerName: null,
  customerEmail: null,
  items: [
    { productId: 1, name: "Pearl Ring", amountMinor: 10000 },
    { productId: null, name: "Gift wrap", amountMinor: 5000 },
  ],
};

const EMPTY_TOTALS = {
  count: 0,
  grossMinor: 0,
  posCount: 0,
  posGrossMinor: 0,
  onlineCount: 0,
  onlineGrossMinor: 0,
};

function payload(over: Record<string, unknown> = {}) {
  return {
    rows: [POS_ROW],
    totals: {
      count: 1,
      grossMinor: 15000,
      posCount: 1,
      posGrossMinor: 15000,
      onlineCount: 0,
      onlineGrossMinor: 0,
    },
    paymentMethods: ["cash"],
    truncated: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.data = payload();
  mocks.isLoading = false;
});
afterEach(() => cleanup());

describe("Sales page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Sales />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("shows an empty state when nothing sold in the range", () => {
    mocks.data = {
      rows: [],
      totals: EMPTY_TOTALS,
      paymentMethods: [],
      truncated: false,
    };
    render(<Sales />);
    expect(screen.getByText("No sales in this range")).toBeTruthy();
  });

  // The whole point of the page: the transaction's total was already visible
  // in the POS app; WHAT SOLD was not.
  it("names the items sold on the row itself", () => {
    render(<Sales />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("KPOS-9")).toBeTruthy();
    expect(within(table).getByText("Pearl Ring, Gift wrap")).toBeTruthy();
    expect(within(table).getByText("CHF 150.00")).toBeTruthy();
  });

  it("expands a row to the per-item prices", () => {
    render(<Sales />);
    const toggle = screen.getByRole("button", {
      name: /Pearl Ring, Gift wrap/,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const breakdown = screen.getByRole("list");
    expect(within(breakdown).getByText("CHF 100.00")).toBeTruthy();
    expect(within(breakdown).getByText("CHF 50.00")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("says so plainly when a sale has no line items recorded", () => {
    mocks.data = payload({ rows: [{ ...POS_ROW, items: [] }] });
    render(<Sales />);
    expect(screen.getByText("No items recorded")).toBeTruthy();
  });

  it("totals the ledger by channel in the summary", () => {
    mocks.data = payload({
      totals: {
        count: 2,
        grossMinor: 23000,
        posCount: 1,
        posGrossMinor: 15000,
        onlineCount: 2,
        onlineGrossMinor: 8000,
      },
    });
    render(<Sales />);
    expect(screen.getByText("CHF 230.00")).toBeTruthy();
    expect(screen.getByText("CHF 80.00")).toBeTruthy();
    // Plural forms resolve rather than rendering a raw key.
    expect(screen.getByText("1 sale")).toBeTruthy();
    expect(screen.getByText("2 sales")).toBeTruthy();
  });

  it("passes the channel filter to the query", () => {
    render(<Sales />);
    fireEvent.click(screen.getByRole("button", { name: "In person" }));
    expect(mocks.lastInput).toMatchObject({ channel: "pos" });
  });

  it("sends the day AFTER the chosen end date, so that day is included", () => {
    render(<Sales />);
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-08-16" },
    });
    expect(mocks.lastInput).toMatchObject({
      to: "2026-08-16T00:00:00.000Z",
    });
  });

  it("offers only the payment methods this store has actually taken", () => {
    mocks.data = payload({ paymentMethods: ["cash", "twint"] });
    render(<Sales />);
    const select = screen.getByLabelText("Payment method");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Any method", "cash", "twint"]);
  });

  it("warns when the window was capped, so the totals aren't read as final", () => {
    mocks.data = payload({ truncated: true });
    render(<Sales />);
    expect(screen.getByText(/1 most recent transactions/)).toBeTruthy();
  });

  it("disables the export when there is nothing to export", () => {
    mocks.data = {
      rows: [],
      totals: EMPTY_TOTALS,
      paymentMethods: [],
      truncated: false,
    };
    render(<Sales />);
    expect(
      screen
        .getByRole("button", { name: /Export CSV/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

// The page is one `admin`-namespace lookup away from raw keys, so pin that the
// ops fragment resolves in a non-default language rather than falling back.
describe("Sales page — translated", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("renders its headings in German", async () => {
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    render(<Sales />);
    expect(screen.getByText("Verkäufe")).toBeTruthy();
    expect(screen.getByText("Bruttoeinnahmen")).toBeTruthy();
  });
});
