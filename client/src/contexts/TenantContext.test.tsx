// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TenantProvider, useTenant } from "./TenantContext";
import { EMPTY_CONTENT } from "@/lib/storefrontContent";

const mocks = vi.hoisted(() => ({
  tenantData: undefined as unknown,
  settingsData: undefined as unknown,
  settingsFetched: true,
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
          isFetched: mocks.settingsFetched,
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
  mocks.tenantData = {
    id: 2,
    slug: "aurora",
    name: "Aurora",
    plan: "free",
    whiteLabel: false,
  };
  mocks.settingsData = null;
  mocks.settingsFetched = true;
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
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
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

// The provider is the only thing that turns a settings row into the content
// the storefront pages read, so a column added to the schema but never mapped
// here would silently never reach a page.
describe("TenantProvider merchant-authored content", () => {
  function contentOf() {
    let seen: unknown;
    function Probe() {
      seen = useTenant().content;
      return null;
    }
    render(
      <TenantProvider slug="aurora">
        <Probe />
      </TenantProvider>,
    );
    return seen as Record<string, unknown>;
  }

  it("hands pages an all-null content object for a store with no settings", () => {
    mocks.settingsData = null;
    expect(contentOf()).toEqual(EMPTY_CONTENT);
  });

  it("maps every authored column through to the storefront", () => {
    mocks.settingsData = {
      heroImageUrl: "https://cdn.example/shopfront.jpg",
      heroHeadline: "Made by hand",
      heroSubtitle: "In the old town since 2018",
      aboutBody: "We opened with one kiln.",
      companyLegalName: "Aurora Atelier GmbH",
      companyAddress: "Musterstrasse 1\n8001 Basel",
      vatNumber: "CHE-123.456.789 MWST",
      companyRegistration: "CH-020.3.001.234-5",
    };
    expect(contentOf()).toEqual(mocks.settingsData);
  });

  it("collapses a blank column to null so pages only branch on null", () => {
    mocks.settingsData = { heroHeadline: "  ", aboutBody: "" };
    expect(contentOf()).toEqual(EMPTY_CONTENT);
  });
});

describe("TenantProvider — the Made with Gwinn credit", () => {
  function creditFor(
    tenant: Record<string, unknown> | undefined,
    settings: Record<string, unknown> | null,
    settingsFetched = true,
  ) {
    mocks.tenantData = tenant;
    mocks.settingsData = settings;
    mocks.settingsFetched = settingsFetched;
    let seen: boolean | undefined;
    function Probe() {
      seen = useTenant().showsPlatformCredit;
      return null;
    }
    render(
      <TenantProvider slug="aurora">
        <Probe />
      </TenantProvider>,
    );
    return seen;
  }

  const free = { id: 2, slug: "aurora", name: "Aurora", whiteLabel: false };
  const pro = { ...free, whiteLabel: true };

  it("credits a store that cannot white-label, whatever the settings row says", () => {
    expect(creditFor(free, null)).toBe(true);
    expect(creditFor(free, { hidePlatformCredit: true })).toBe(true);
  });

  it("credits a white-label store until it actually switches the credit off", () => {
    expect(creditFor(pro, null)).toBe(true);
    expect(creditFor(pro, { hidePlatformCredit: false })).toBe(true);
    expect(creditFor(pro, { hidePlatformCredit: true })).toBe(false);
  });

  it("does not flash the credit onto a white-label store mid-load", () => {
    // Settings not back yet: this store MIGHT have opted out, so withhold.
    expect(creditFor(pro, undefined as never, false)).toBe(false);
    // …but a store that cannot opt out is credited straight away, without
    // waiting on a second request that cannot change the answer.
    expect(creditFor(free, undefined as never, false)).toBe(true);
  });

  it("shows nothing before the store itself has resolved", () => {
    expect(creditFor(undefined, null)).toBe(false);
  });

  it("shows nothing outside a provider — the marketing surface IS Gwinn", () => {
    let seen: boolean | undefined;
    function Probe() {
      seen = useTenant().showsPlatformCredit;
      return null;
    }
    render(<Probe />);
    expect(seen).toBe(false);
  });
});
