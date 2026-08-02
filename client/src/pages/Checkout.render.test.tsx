import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import { CartProvider, type CartItem } from "@/contexts/CartContext";
import Checkout from "./Checkout";

const CART_KEY = "kalakosh_cart";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  configData: { enabled: true } as { enabled: boolean } | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkout: {
      config: { useQuery: () => ({ data: mocks.configData }) },
      createSession: {
        useMutation: () => ({ mutateAsync: mocks.createSession }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// nameEn present on the ring, absent on the earrings — the earrings must fall
// back to the primary (untranslated) name even with the UI in English.
const ring: CartItem = {
  id: 1,
  name: "Silberring Mond",
  nameEn: "Silver Moonstone Ring",
  nameDe: null,
  nameFr: null,
  price: "185.00",
  imageUrl: "https://example.com/ring.jpg",
  category: "Rings",
};
const earrings: CartItem = {
  id: 2,
  name: "Perlen Ohrringe",
  nameEn: null,
  nameDe: null,
  nameFr: null,
  price: "120.00",
  imageUrl: null,
  category: "Earrings",
};

function seedCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function storedCart(): CartItem[] {
  return JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
}

function renderCheckout() {
  const { hook, history } = memoryLocation({
    path: "/checkout",
    record: true,
  });
  const view = render(
    <Router hook={hook}>
      <CartProvider>
        <Checkout />
      </CartProvider>
    </Router>,
  );
  return { ...view, history };
}

const payButton = () =>
  screen.getByRole("button", { name: new RegExp(en.checkout.payNow) });

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.configData = { enabled: true };
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("Checkout page", () => {
  it("shows the empty-bag state with a link back to the shop", () => {
    renderCheckout();
    expect(screen.getByText(en.checkout.emptyTitle)).toBeTruthy();
    const browse = screen.getByRole("link", { name: en.checkout.browseShop });
    expect(browse.getAttribute("href")).toBe("/shop");
    expect(screen.queryByText(en.checkout.payNow)).toBeNull();
  });

  it("lists the bag's items with localized names, prices, and subtotal", () => {
    seedCart([ring, earrings]);
    renderCheckout();
    expect(screen.getByText("Silver Moonstone Ring")).toBeTruthy();
    expect(screen.getByText("Perlen Ohrringe")).toBeTruthy();
    expect(screen.getByText("CHF 185.00")).toBeTruthy();
    expect(screen.getByText("CHF 120.00")).toBeTruthy();
    // Subtotal in the payment panel.
    expect(screen.getByText("CHF 305.00")).toBeTruthy();
  });

  it("keeps the pay button disabled until the policy is accepted", () => {
    seedCart([ring]);
    renderCheckout();
    const button = payButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(true);
  });

  it("starts a checkout session with the bag's product ids and shows the redirecting state", async () => {
    seedCart([ring, earrings]);
    let resolveSession!: (value: { url: string | null }) => void;
    mocks.createSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    renderCheckout();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(payButton());

    expect(mocks.createSession).toHaveBeenCalledWith({ productIds: [1, 2] });
    await waitFor(() =>
      expect(screen.getByText(en.checkout.redirecting)).toBeTruthy(),
    );

    // A session without a URL cannot redirect — surface the error and recover.
    resolveSession({ url: null });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(en.checkout.error),
    );
    expect(screen.getByText(en.checkout.payNow)).toBeTruthy();
  });

  it("surfaces a rejected checkout mutation and re-enables the button", async () => {
    seedCart([ring]);
    mocks.createSession.mockRejectedValue(new Error("Card declined"));
    renderCheckout();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(payButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Card declined"),
    );
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("removes a single item from the bag", () => {
    seedCart([ring, earrings]);
    renderCheckout();
    fireEvent.click(screen.getAllByLabelText(en.cart.remove)[0]);
    expect(screen.queryByText("Silver Moonstone Ring")).toBeNull();
    expect(screen.getByText("Perlen Ohrringe")).toBeTruthy();
    // With one item left its line price equals the bag total, so the same
    // amount legitimately renders twice.
    expect(screen.getAllByText("CHF 120.00").length).toBe(2);
    expect(storedCart().map((i) => i.id)).toEqual([2]);
  });

  it("clears the bag and navigates back to the shop", () => {
    seedCart([ring, earrings]);
    const { history } = renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: en.checkout.clearBag }));
    expect(storedCart()).toEqual([]);
    expect(history).toContain("/shop");
    expect(screen.getByText(en.checkout.emptyTitle)).toBeTruthy();
  });

  it("hides the pay button when checkout is disabled for the tenant", () => {
    seedCart([ring]);
    mocks.configData = { enabled: false };
    renderCheckout();
    expect(screen.getByText(en.checkout.unavailable)).toBeTruthy();
    expect(screen.queryByText(en.checkout.payNow)).toBeNull();
  });

  it("links the policy checkbox label to the policy page", () => {
    seedCart([ring]);
    renderCheckout();
    const policyLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/policy");
    expect(policyLinks.length).toBeGreaterThan(0);
  });
});
