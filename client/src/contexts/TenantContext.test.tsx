// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TenantProvider } from "./TenantContext";

const mocks = vi.hoisted(() => ({
  tenantData: undefined as unknown,
  settingsData: undefined as unknown,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      getBySlug: {
        useQuery: () => ({
          data: mocks.tenantData,
          isLoading: false,
          isError: false,
        }),
      },
      getSettings: {
        useQuery: () => ({
          data: mocks.settingsData,
          isLoading: false,
          isError: false,
        }),
      },
    },
  },
}));

function renderProvider() {
  return render(
    <TenantProvider slug="aurora">
      <div>store</div>
    </TenantProvider>,
  );
}

const rootStyle = () => document.documentElement.style;

beforeEach(() => {
  mocks.tenantData = { id: 2, slug: "aurora", name: "Aurora", plan: "free" };
  mocks.settingsData = null;
});

afterEach(() => {
  cleanup();
  // Belt: no test leaks inline vars into the next.
  document.documentElement.removeAttribute("style");
});

describe("TenantProvider template theming", () => {
  it("writes the chosen template's surface variables to the document", () => {
    mocks.settingsData = { templateId: "verdant" };
    renderProvider();
    expect(rootStyle().getPropertyValue("--brand-ground")).toBe("#f4f7f0");
    expect(rootStyle().getPropertyValue("--brand-surface")).toBe("#e7ede1");
    expect(rootStyle().getPropertyValue("--brand-border")).toBe("#d5dfca");
  });

  it("removes the overrides on unmount so surfaces fall back to the CSS defaults", () => {
    mocks.settingsData = { templateId: "azure" };
    const { unmount } = renderProvider();
    expect(rootStyle().getPropertyValue("--brand-ground")).toBe("#f3f6f9");
    unmount();
    expect(rootStyle().getPropertyValue("--brand-ground")).toBe("");
  });

  it("writes nothing for no template, the default template, or an unknown id", () => {
    for (const templateId of [null, "atelier", "brutalist"]) {
      mocks.settingsData = templateId ? { templateId } : null;
      const { unmount } = renderProvider();
      expect(rootStyle().getPropertyValue("--brand-ground")).toBe("");
      unmount();
    }
  });

  it("composes with the brand color: template surfaces and derived ink coexist", () => {
    mocks.settingsData = { templateId: "porcelain", primaryColor: "#1E4E79" };
    renderProvider();
    // Surface from the template…
    expect(rootStyle().getPropertyValue("--brand-surface")).toBe("#eceef0");
    // …ink family from the merchant's own color (via derivePalette).
    expect(rootStyle().getPropertyValue("--brand-ink")).not.toBe("");
  });
});

/** Hue of a rendered `#rrggbb`, for asserting which color a swatch came from. */
function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  if (max === r) return (((g - b) / d + (g < b ? 6 : 0)) * 60) % 360;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

describe("TenantProvider two-color branding", () => {
  it("drives the ink from the primary and the accent from the secondary", () => {
    // Espresso + gold: two hues a single-color derivation cannot produce.
    mocks.settingsData = {
      primaryColor: "#3B2F1E",
      secondaryColor: "#2E7DD1",
    };
    renderProvider();

    const ink = rootStyle().getPropertyValue("--brand-ink");
    const accent = rootStyle().getPropertyValue("--brand-accent");
    expect(Math.abs(hueOf(ink) - hueOf("#3B2F1E"))).toBeLessThan(8);
    expect(Math.abs(hueOf(accent) - hueOf("#2E7DD1"))).toBeLessThan(8);
    // The two families genuinely diverge rather than being tints of each other.
    expect(Math.abs(hueOf(ink) - hueOf(accent))).toBeGreaterThan(20);
  });

  it("applies a store's own highlight even when it keeps the default ink", () => {
    // The early-return has to check BOTH halves, or a store that only picks a
    // secondary silently gets no palette written at all.
    mocks.settingsData = {
      primaryColor: "#2D2620",
      secondaryColor: "#2E7DD1",
    };
    renderProvider();
    const accent = rootStyle().getPropertyValue("--brand-accent");
    expect(accent).not.toBe("");
    expect(Math.abs(hueOf(accent) - hueOf("#2E7DD1"))).toBeLessThan(8);
  });

  it("leaves the default palette alone for a store that picked neither", () => {
    mocks.settingsData = { primaryColor: "#2D2620" };
    renderProvider();
    expect(rootStyle().getPropertyValue("--brand-ink")).toBe("");
    expect(rootStyle().getPropertyValue("--brand-accent")).toBe("");
  });

  it("falls back to deriving the accent from the primary when there is no secondary", () => {
    mocks.settingsData = { primaryColor: "#1E4E79" };
    renderProvider();
    const ink = rootStyle().getPropertyValue("--brand-ink");
    const accent = rootStyle().getPropertyValue("--brand-accent");
    expect(accent).not.toBe("");
    // Same hue family as the ink — the pre-two-color behaviour, preserved.
    expect(Math.abs(hueOf(ink) - hueOf(accent))).toBeLessThan(12);
  });
});
