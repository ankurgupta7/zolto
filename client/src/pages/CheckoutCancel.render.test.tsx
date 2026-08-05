import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import CheckoutCancel from "./CheckoutCancel";

function renderCancel() {
  const { hook } = memoryLocation({ path: "/checkout/cancel", static: true });
  return render(
    <Router hook={hook}>
      <CheckoutCancel />
    </Router>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("CheckoutCancel page", () => {
  it("reassures the shopper that nothing was charged", () => {
    renderCancel();
    expect(
      screen.getByRole("heading", { level: 1, name: en.cancel.title }),
    ).toBeTruthy();
    expect(screen.getByText(en.cancel.body)).toBeTruthy();
  });

  it("offers both exits — back to checkout and back to the shop", () => {
    renderCancel();
    expect(
      screen
        .getByRole("link", { name: en.cancel.backToCheckout })
        .getAttribute("href"),
    ).toBe("/checkout");
    expect(
      screen
        .getByRole("link", { name: en.cancel.continueShopping })
        .getAttribute("href"),
    ).toBe("/shop");
  });

  it("renders translated copy rather than raw i18n keys", () => {
    renderCancel();
    expect(screen.queryByText(/^cancel\./)).toBeNull();
  });

  it("follows the shop's language when it switches to German", async () => {
    await i18n.changeLanguage("de");
    renderCancel();
    expect(
      screen.getByRole("heading", { level: 1, name: de.cancel.title }),
    ).toBeTruthy();
  });
});
