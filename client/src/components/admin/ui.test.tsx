import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import { ADMIN_NAV } from "@/admin/nav";
import coreEn from "@/admin/locales/core.en.json";
import {
  AdminOnly,
  EmptyState,
  LoadingState,
  PlanGate,
  navLabelKey,
} from "./ui";

beforeEach(async () => {
  // Language tests below switch languages; every test starts from English.
  await i18n.changeLanguage("en");
});

afterEach(cleanup);

function withRouter(ui: React.ReactNode) {
  const { hook } = memoryLocation({ path: "/admin", static: true });
  return render(<Router hook={hook}>{ui}</Router>);
}

describe("EmptyState", () => {
  it("shows the title and description", () => {
    withRouter(
      <EmptyState title="No orders yet" description="They'll land here." />,
    );
    expect(screen.getByRole("heading", { name: "No orders yet" })).toBeTruthy();
    expect(screen.getByText("They'll land here.")).toBeTruthy();
  });

  it("renders the hand-lettered note when given one", () => {
    withRouter(
      <EmptyState title="No orders yet" note="the first one is a good day" />,
    );
    const note = screen.getByText("the first one is a good day");
    // The pen is allowed to decorate an empty state, and only in the hand face.
    expect(note.className).toContain("font-hand");
  });

  it("omits the note entirely when there isn't one", () => {
    const { container } = withRouter(<EmptyState title="Nothing here" />);
    expect(container.querySelector(".font-hand")).toBeNull();
  });

  it("keeps the sketch ring decorative so it isn't announced", () => {
    const { container } = withRouter(
      <EmptyState title="Nothing" icon={<svg data-testid="glyph" />} />,
    );
    // SketchCircle renders aria-hidden; the ring must never reach the a11y tree.
    const rings = container.querySelectorAll('[aria-hidden="true"]');
    expect(rings.length).toBeGreaterThan(0);
  });

  it("still renders the caller's action", () => {
    withRouter(
      <EmptyState title="Locked" action={<button type="button">Go</button>} />,
    );
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });
});

describe("LoadingState", () => {
  it("announces the wait instead of spinning silently", () => {
    // A bare spinner is invisible to a screen reader — the page just reads empty.
    render(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBeTruthy();
  });

  it("uses the caller's label when the wait has a specific meaning", () => {
    render(<LoadingState label="Counting your orders…" />);
    expect(screen.getByText("Counting your orders…")).toBeTruthy();
  });

  it("falls back to a friendly default", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status").textContent).toMatch(/fetching/i);
  });

  it("speaks the viewer's language for the default label", async () => {
    await i18n.changeLanguage("de");
    render(<LoadingState />);
    expect(screen.getByRole("status").textContent).toContain(
      "Ihre Daten werden geladen…",
    );
  });
});

describe("navLabelKey", () => {
  it("slugifies manifest labels into core.nav keys", () => {
    expect(navLabelKey("Home")).toBe("core.nav.home");
    expect(navLabelKey("POS")).toBe("core.nav.pos");
    expect(navLabelKey("Plan & billing")).toBe("core.nav.plan-billing");
    expect(navLabelKey("Keys & access")).toBe("core.nav.keys-access");
  });

  it("has a core.nav translation for every label in the nav manifest", () => {
    // nav.ts stays pure English data; the shell translates by looked-up key
    // with the label as defaultValue. A missing key silently renders English,
    // so this guard is the only thing that notices a label/locale drift.
    const nav = (coreEn as { core: { nav: Record<string, unknown> } }).core.nav;
    for (const item of ADMIN_NAV) {
      const key = navLabelKey(item.label).replace(/^core\.nav\./, "");
      expect(
        typeof nav[key],
        `core.en.json is missing core.nav.${key} for label "${item.label}"`,
      ).toBe("string");
    }
  });
});

describe("PlanGate", () => {
  it("names the feature and required plan, and links to the plans page", () => {
    withRouter(<PlanGate requiredPlan="pro" feature="Insights" />);
    expect(
      screen.getByRole("heading", { name: "Insights is a Pro-plan feature" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Upgrade to Pro or above to unlock insights."),
    ).toBeTruthy();
    const link = screen.getByText("View plans").closest("a");
    expect(link?.getAttribute("href")).toBe("/admin/account/plan");
  });

  it("translates the upsell", async () => {
    await i18n.changeLanguage("de");
    withRouter(<PlanGate requiredPlan="pro" feature="Insights" />);
    expect(
      screen.getByRole("heading", {
        name: "Insights ist eine Funktion des Pro-Plans",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Pläne ansehen")).toBeTruthy();
  });
});

describe("AdminOnly", () => {
  it("explains who manages this part of the account", () => {
    withRouter(<AdminOnly />);
    expect(screen.getByRole("heading", { name: "Admins only" })).toBeTruthy();
    expect(
      screen.getByText(
        "This part of your Gwinn account is managed by the store owner or an admin.",
      ),
    ).toBeTruthy();
  });
});
