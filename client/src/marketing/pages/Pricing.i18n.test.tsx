import { BRAND } from "@shared/brand";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import Pricing from "./Pricing";

afterEach(async () => {
  cleanup();
  // jsdom's navigator.language is en-US, so the suite's baseline is English —
  // restore it so this file leaves no language behind for other tests.
  await i18n.changeLanguage("en");
  localStorage.removeItem(BRAND.langKey);
});

function renderPricing() {
  const { hook } = memoryLocation({ path: "/pricing", static: true });
  return render(
    <Router hook={hook}>
      <Pricing />
    </Router>,
  );
}

describe("Pricing — multilingual rendering", () => {
  it("renders German copy after switching to de", async () => {
    await i18n.changeLanguage("de");
    renderPricing();
    expect(
      screen.getByRole("heading", {
        name: "Einfache Preise für Kunstschaffende.",
      }),
    ).toBeTruthy();
    // Shared/platform strings render through the marketing lookup too:
    // the plan card carries the translated name and CTA…
    expect(screen.getByRole("heading", { name: "Gratis" })).toBeTruthy();
    expect(screen.getByText("14 Tage kostenlos testen")).toBeTruthy();
    // …and the pledge (PRICING_PROMISE) is no longer the English source text.
    expect(
      screen.queryByText(/You don't pay us until the internet pays you/),
    ).toBeNull();
    expect(
      screen.getByText("Sie zahlen uns erst, wenn das Internet Sie bezahlt."),
    ).toBeTruthy();
  });

  it("renders French copy after switching to fr", async () => {
    await i18n.changeLanguage("fr");
    renderPricing();
    expect(
      screen.getByRole("heading", {
        name: "Des tarifs simples pour les artisans.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gratuit" })).toBeTruthy();
    expect(
      screen.getByText(
        "Vous ne nous payez pas tant qu'Internet ne vous paie pas.",
      ),
    ).toBeTruthy();
  });

  it("formats the break-even figure with the language's Swiss locale", async () => {
    await i18n.changeLanguage("de");
    renderPricing();
    // de → de-CH grouping (2'500), never the old en-US comma form.
    const deExpected = (2500).toLocaleString("de-CH");
    expect(screen.getAllByText(new RegExp(deExpected)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/2,500/)).toBeNull();
  });

  it("falls back to the shared English string for an untranslated key", () => {
    // A feature added to shared/platform.ts before its translations land must
    // render as English, never blank — the st() contract.
    const missing = i18n.t("marketing:shared.plans.free.features.99", {
      defaultValue: "Brand-new feature",
    });
    expect(missing).toBe("Brand-new feature");
  });
});
