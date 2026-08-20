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
  // The basket's live discount check (`discounts.check`), reached through
  // trpc.useUtils().…fetch so the panel can ask on demand rather than on every
  // keystroke.
  checkDiscount: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      discounts: { check: { fetch: mocks.checkDiscount } },
    }),
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
  sessionStorage.clear();
  mocks.configData = { enabled: true };
  mocks.checkDiscount.mockResolvedValue({
    valid: false,
    message: "That discount code isn't valid for this basket.",
  });
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

    // The storefront language rides along so Stripe Checkout and the receipt
    // email match the language the customer shopped in.
    expect(mocks.createSession).toHaveBeenCalledWith({
      productIds: [1, 2],
      locale: "en",
    });
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

describe("Checkout discount code", () => {
  const applyField = () =>
    screen.getByLabelText(en.checkout.discountLabel) as HTMLInputElement;
  const applyButton = () =>
    screen.getByRole("button", { name: en.checkout.discountApply });

  it("offers a code field alongside the bag total", () => {
    seedCart([ring]);
    renderCheckout();
    expect(applyField()).toBeTruthy();
    expect(applyButton()).toBeTruthy();
  });

  it("asks the server what the code is worth on THIS basket", async () => {
    seedCart([ring, earrings]);
    mocks.checkDiscount.mockResolvedValue({
      valid: true,
      code: "WELCOME10",
      amountOffRappen: 3050,
      subtotalRappen: 30_500,
      currency: "chf",
      description: "10% off",
    });
    renderCheckout();
    fireEvent.change(applyField(), { target: { value: "welcome10" } });
    fireEvent.click(applyButton());
    await waitFor(() =>
      expect(mocks.checkDiscount).toHaveBeenCalledWith({
        code: "welcome10",
        productIds: [1, 2],
      }),
    );
  });

  it("shows what came off and the new total", async () => {
    seedCart([ring, earrings]); // CHF 305.00
    mocks.checkDiscount.mockResolvedValue({
      valid: true,
      code: "WELCOME10",
      amountOffRappen: 3050,
      subtotalRappen: 30_500,
      currency: "chf",
      description: "10% off",
    });
    renderCheckout();
    fireEvent.change(applyField(), { target: { value: "WELCOME10" } });
    fireEvent.click(applyButton());
    await screen.findByText("−CHF 30.50");
    expect(screen.getByText("CHF 274.50")).toBeTruthy();
    // The subtotal stays visible: a shopper needs to see both numbers to
    // believe the discount.
    expect(screen.getByText("CHF 305.00")).toBeTruthy();
  });

  it("says why a code was refused, and applies nothing", async () => {
    seedCart([ring]);
    mocks.checkDiscount.mockResolvedValue({
      valid: false,
      message: "That discount code has expired.",
    });
    renderCheckout();
    fireEvent.change(applyField(), { target: { value: "OLD" } });
    fireEvent.click(applyButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That discount code has expired.",
      ),
    );
    expect(screen.queryByText(/−CHF/)).toBeNull();
  });

  it("sends the applied code with the checkout session", async () => {
    seedCart([ring]);
    mocks.checkDiscount.mockResolvedValue({
      valid: true,
      code: "WELCOME10",
      amountOffRappen: 1850,
      subtotalRappen: 18_500,
      currency: "chf",
      description: "10% off",
    });
    mocks.createSession.mockResolvedValue({
      url: "https://checkout.stripe.com/cs_1",
      sessionId: "cs_1",
      discount: { code: "WELCOME10", amountOffRappen: 1850 },
    });
    renderCheckout();
    fireEvent.change(applyField(), { target: { value: "WELCOME10" } });
    fireEvent.click(applyButton());
    await screen.findByText("−CHF 18.50");

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(payButton());
    await waitFor(() =>
      expect(mocks.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ discountCode: "WELCOME10" }),
      ),
    );
  });

  it("sends no code when none was applied", async () => {
    seedCart([ring]);
    mocks.createSession.mockResolvedValue({
      url: "https://checkout.stripe.com/cs_1",
      sessionId: "cs_1",
      discount: null,
    });
    renderCheckout();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(payButton());
    await waitFor(() =>
      expect(mocks.createSession.mock.calls[0][0].discountCode).toBeUndefined(),
    );
  });

  it("lets the shopper take the code back off", async () => {
    seedCart([ring]);
    mocks.checkDiscount.mockResolvedValue({
      valid: true,
      code: "WELCOME10",
      amountOffRappen: 1850,
      subtotalRappen: 18_500,
      currency: "chf",
      description: "10% off",
    });
    renderCheckout();
    fireEvent.change(applyField(), { target: { value: "WELCOME10" } });
    fireEvent.click(applyButton());
    await screen.findByText("−CHF 18.50");

    fireEvent.click(screen.getByLabelText(en.checkout.discountRemove));
    expect(screen.queryByText("−CHF 18.50")).toBeNull();
    expect(applyField()).toBeTruthy();
  });

  // The whole point of a share link is that the friend types nothing.
  it("applies a code carried in from a share link, by itself", async () => {
    seedCart([ring]);
    sessionStorage.setItem("gwinn_discount_code", "FRIENDS-7K3P");
    mocks.checkDiscount.mockResolvedValue({
      valid: true,
      code: "FRIENDS-7K3P",
      amountOffRappen: 1850,
      subtotalRappen: 18_500,
      currency: "chf",
      description: "10% off",
    });
    renderCheckout();
    await screen.findByText("−CHF 18.50");
    expect(mocks.checkDiscount).toHaveBeenCalledWith({
      code: "FRIENDS-7K3P",
      productIds: [1],
    });
    // Consumed once: a shopper who removes it must not have it reappear.
    expect(sessionStorage.getItem("gwinn_discount_code")).toBeNull();
  });

  it("does not chase a carried code on an empty basket", () => {
    sessionStorage.setItem("gwinn_discount_code", "FRIENDS-7K3P");
    renderCheckout();
    expect(mocks.checkDiscount).not.toHaveBeenCalled();
  });
});
