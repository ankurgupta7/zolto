import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Till from "./Till";

const mocks = vi.hoisted(() => ({
  catalogue: {
    currency: "CHF",
    twintQrUrl: null as string | null,
    products: [
      {
        id: 1,
        name: "Vase Bergblume",
        nameEn: "Bergblume Vase",
        category: "Vases",
        imageUrl: null,
        visible: true,
        quantity: 1,
        priceRappen: 8500,
      },
      {
        id: 2,
        name: "Schale Alpin",
        nameEn: "Alpine Bowl",
        category: "Bowls",
        imageUrl: null,
        visible: true,
        quantity: 1,
        priceRappen: 4500,
      },
    ],
  } as Record<string, unknown>,
  startCardPayment: vi.fn(),
  recordAttestedSale: vi.fn(),
  refetch: vi.fn(),
  orderStatus: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    till: {
      products: {
        useQuery: () => ({
          data: mocks.catalogue,
          isLoading: false,
          refetch: mocks.refetch,
        }),
      },
      orderStatus: { useQuery: () => ({ data: mocks.orderStatus }) },
      startCardPayment: {
        useMutation: () => ({
          mutate: mocks.startCardPayment,
          isPending: false,
        }),
      },
      recordAttestedSale: {
        useMutation: () => ({
          mutate: mocks.recordAttestedSale,
          isPending: false,
        }),
      },
    },
  },
}));

// i18n is exercised by adminLocales.test.ts; here the key itself is the label,
// which keeps assertions about *which* control was pressed unambiguous.
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalogue = { ...mocks.catalogue, twintQrUrl: null };
  mocks.orderStatus = undefined;
});

afterEach(cleanup);

function addFirstProduct() {
  fireEvent.click(screen.getByRole("button", { name: /Vase Bergblume/ }));
}

describe("the cart", () => {
  it("starts empty, with every payment button disabled", () => {
    // A till that will happily "sell" nothing produces CHF 0.00 orders.
    render(<Till />);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: /ops.till.payCard/,
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: /ops.till.payCash/,
      }).disabled,
    ).toBe(true);
  });

  it("totals what has been added", () => {
    render(<Till />);
    addFirstProduct();
    expect(screen.getByText("CHF 85.00", { selector: "span" })).toBeTruthy();
  });

  it("removes a product tapped a second time rather than adding it twice", () => {
    // Duplicate ids fail the backend's stale-cart check outright.
    render(<Till />);
    addFirstProduct();
    addFirstProduct();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: /ops.till.payCard/,
      }).disabled,
    ).toBe(true);
  });
});

describe("payment buttons", () => {
  it("hides the direct-TWINT button until a code has been uploaded", () => {
    // A button that would show a blank square is worse than no button.
    render(<Till />);
    expect(screen.queryByRole("button", { name: /payTwintQr/ })).toBeNull();
  });

  it("offers the direct-TWINT button once a code exists", () => {
    mocks.catalogue = {
      ...mocks.catalogue,
      twintQrUrl: "https://cdn.example.com/twint.png",
    };
    render(<Till />);
    expect(screen.getByRole("button", { name: /payTwintQr/ })).toBeTruthy();
  });

  it("records cash as an attested sale, not a card one", () => {
    render(<Till />);
    addFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: /ops.till.payCash/ }));

    expect(mocks.recordAttestedSale).toHaveBeenCalledWith(
      expect.objectContaining({ method: "cash", productIds: [1] }),
    );
    expect(mocks.startCardPayment).not.toHaveBeenCalled();
  });

  it("does not record a TWINT sale until the cashier confirms they saw it", () => {
    // Nothing can confirm a direct-TWINT payment for us, so pressing the button
    // must only show the code — the sale is recorded on the second press.
    mocks.catalogue = {
      ...mocks.catalogue,
      twintQrUrl: "https://cdn.example.com/twint.png",
    };
    render(<Till />);
    addFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: /payTwintQr/ }));

    expect(mocks.recordAttestedSale).not.toHaveBeenCalled();
    expect(screen.getByText("ops.till.twintQrAttestNote")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /ops.till.twintQrConfirm/ }),
    );
    expect(mocks.recordAttestedSale).toHaveBeenCalledWith(
      expect.objectContaining({ method: "twint_qr" }),
    );
  });

  it("asks the server for a card QR rather than recording anything", () => {
    render(<Till />);
    addFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: /ops.till.payCard/ }));

    expect(mocks.startCardPayment).toHaveBeenCalledWith(
      expect.objectContaining({ productIds: [1] }),
    );
    expect(mocks.recordAttestedSale).not.toHaveBeenCalled();
  });
});

describe("the catalogue", () => {
  it("filters by name as the cashier types", () => {
    render(<Till />);
    fireEvent.change(screen.getByLabelText("ops.till.searchPlaceholder"), {
      target: { value: "alpin" },
    });
    expect(screen.queryByText("Vase Bergblume")).toBeNull();
    expect(screen.getByText("Schale Alpin")).toBeTruthy();
  });

  it("shows the store's own currency", () => {
    mocks.catalogue = { ...mocks.catalogue, currency: "EUR" };
    render(<Till />);
    expect(screen.getByText("EUR 85.00")).toBeTruthy();
  });
});
