import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import { CartProvider, type CartItem } from "@/contexts/CartContext";
import CheckoutSuccess from "./CheckoutSuccess";

const CART_KEY = "kalakosh_cart";

interface OrderData {
  status: string;
  amountTotal?: number | null;
  currency?: string;
  reference?: number | null;
  customerName?: string | null;
  customerEmail?: string | null;
  paymentMethod?: string | null;
  createdAt?: string;
  items?: {
    id: number;
    name: string;
    nameEn: string | null;
    price: string;
    imageUrl: string | null;
  }[];
}

const mocks = vi.hoisted(() => ({
  orderData: undefined as OrderData | undefined,
  isLoading: false,
  lastQueryInput: null as { sessionId: string } | null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkout: {
      orderStatus: {
        useQuery: (input: { sessionId: string }) => {
          mocks.lastQueryInput = input;
          return { data: mocks.orderData, isLoading: mocks.isLoading };
        },
      },
    },
  },
}));

const bagItem: CartItem = {
  id: 1,
  name: "Silberring Mond",
  nameEn: "Silver Moonstone Ring",
  nameDe: null,
  nameFr: null,
  price: "185.00",
  imageUrl: null,
  category: "Rings",
};

function renderSuccess() {
  const { hook } = memoryLocation({ path: "/checkout/success", static: true });
  return render(
    <Router hook={hook}>
      <CartProvider>
        <CheckoutSuccess />
      </CartProvider>
    </Router>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.orderData = undefined;
  mocks.isLoading = false;
  mocks.lastQueryInput = null;
  // The page reads session_id from the real URL, not the wouter hook.
  window.history.replaceState({}, "", "/checkout/success?session_id=cs_123");
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("CheckoutSuccess page", () => {
  it("polls the order status with the session id from the URL", () => {
    renderSuccess();
    expect(mocks.lastQueryInput).toEqual({ sessionId: "cs_123" });
  });

  it("empties the bag on arrival — payment has been initiated", async () => {
    localStorage.setItem(CART_KEY, JSON.stringify([bagItem]));
    renderSuccess();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(CART_KEY) ?? "[]")).toEqual([]),
    );
  });

  it("shows the processing state while the webhook has not confirmed payment", () => {
    mocks.orderData = { status: "pending" };
    renderSuccess();
    expect(screen.getByText(en.success.titleProcessing)).toBeTruthy();
    expect(screen.getByText(en.success.bodyProcessing)).toBeTruthy();
  });

  it("shows the paid confirmation with total, reference, email, and receipt", () => {
    mocks.orderData = {
      status: "paid",
      amountTotal: 18500,
      currency: "chf",
      reference: 42,
      customerName: "Ada",
      customerEmail: "ada@example.com",
      paymentMethod: "card",
      createdAt: new Date("2026-07-01T10:00:00Z").toISOString(),
      items: [
        {
          id: 1,
          name: "Silberring Mond",
          nameEn: "Silver Moonstone Ring",
          price: "185.00",
          imageUrl: null,
        },
      ],
    };
    renderSuccess();
    // The receipt footer repeats the thank-you line, so scope to the heading.
    expect(
      screen.getByRole("heading", { level: 1, name: en.success.titlePaid }),
    ).toBeTruthy();
    // The total legitimately appears twice: the page summary and the receipt.
    expect(screen.getAllByText("CHF 185.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Order reference: #00042")).toBeTruthy();
    expect(
      screen.getByText("A confirmation has been sent to ada@example.com."),
    ).toBeTruthy();
    // The printable receipt renders only for paid orders with items, and
    // localizes item names — under "en" the English name wins over the
    // merchant's primary German text.
    expect(screen.getByText(en.success.receipt.title)).toBeTruthy();
    expect(screen.getByText("Silver Moonstone Ring")).toBeTruthy();
  });

  it("hides the receipt while the order is still processing", () => {
    mocks.orderData = { status: "pending" };
    renderSuccess();
    expect(screen.queryByText(en.success.receipt.title)).toBeNull();
  });

  it("offers a continue-shopping link back to the shop", () => {
    renderSuccess();
    const link = screen.getByRole("link", {
      name: en.success.continueShopping,
    });
    expect(link.getAttribute("href")).toBe("/shop");
  });
});
