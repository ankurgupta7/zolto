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
