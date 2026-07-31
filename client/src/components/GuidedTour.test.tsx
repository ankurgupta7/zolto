import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import GuidedTour from "./GuidedTour";
import { isTourCompleted, type TourStep } from "@/lib/tour";

// jsdom doesn't implement scrollIntoView; stub it so the layout effect is happy.
beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const STEPS: TourStep[] = [
  { target: '[data-tour="a"]', title: "First", body: "Do A" },
  { target: '[data-tour="b"]', title: "Second", body: "Do B" },
];

function renderTour(steps: TourStep[] = STEPS, props = {}) {
  return render(
    <div>
      <button type="button" data-tour="a">
        A
      </button>
      <button type="button" data-tour="b">
        B
      </button>
      <GuidedTour tourId="test" steps={steps} {...props} />
    </div>,
  );
}

describe("GuidedTour", () => {
  it("auto-starts on the first step for a first-time user", async () => {
    renderTour();
    expect(await screen.findByText("First")).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
  });

  it("advances with Next and shows Back only after step 1", async () => {
    renderTour();
    await screen.findByText("First");
    expect(screen.queryByText("Back")).toBeNull();
    fireEvent.click(screen.getByText("Next"));
    expect(await screen.findByText("Second")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
  });

  it("marks the tour completed when finished via Done", async () => {
    renderTour();
    await screen.findByText("First");
    fireEvent.click(screen.getByText("Next"));
    await screen.findByText("Second");
    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => expect(screen.queryByText("Second")).toBeNull());
    expect(isTourCompleted("test")).toBe(true);
  });

  it("Skip closes the tour without marking it complete", async () => {
    renderTour();
    await screen.findByText("First");
    fireEvent.click(screen.getByText("Skip"));
    await waitFor(() => expect(screen.queryByText("First")).toBeNull());
    expect(isTourCompleted("test")).toBe(false);
  });

  it("does not auto-start for a user who already completed it", async () => {
    localStorage.setItem("zolto.tour.test", "done");
    renderTour();
    // Give effects a chance to run; nothing should appear.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("First")).toBeNull();
  });

  it("skips a step whose target is missing from the page", async () => {
    const steps: TourStep[] = [
      { target: '[data-tour="missing"]', title: "Ghost", body: "gone" },
      { target: '[data-tour="b"]', title: "Real", body: "here" },
    ];
    renderTour(steps);
    // The missing first step is skipped; the second renders.
    expect(await screen.findByText("Real")).toBeTruthy();
    expect(screen.queryByText("Ghost")).toBeNull();
  });

  it("closes on Escape", async () => {
    renderTour();
    await screen.findByText("First");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("First")).toBeNull());
    expect(isTourCompleted("test")).toBe(false);
  });
});

/**
 * Positioning regressions. `.page-enter` animates `transform` with
 * `animation-fill-mode: forwards`, so the admin page permanently carries a
 * transform — which makes it the containing block for `position: fixed`
 * descendants. Mounted in place, the overlay is positioned against the
 * full-height page element rather than the viewport, so the spotlight sits
 * offset from its target and scrolls away with the page. The portal is what
 * keeps viewport coordinates meaning what they say.
 */
describe("GuidedTour positioning", () => {
  function stubRect(el: Element, rect: Partial<DOMRect>) {
    const full = { top: 0, left: 0, width: 0, height: 0, ...rect };
    el.getBoundingClientRect = () =>
      ({
        ...full,
        right: full.left + full.width,
        bottom: full.top + full.height,
        x: full.left,
        y: full.top,
        toJSON: () => full,
      }) as DOMRect;
  }

  it("renders on document.body, outside any transformed ancestor", async () => {
    render(
      // Same shape as Admin.tsx: the tour lives inside the transformed page.
      <div className="page-enter">
        <button type="button" data-tour="a">
          A
        </button>
        <GuidedTour tourId="test" steps={[STEPS[0]]} />
      </div>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.closest(".page-enter")).toBeNull();
  });

  it("spotlights the target at its viewport coordinates", async () => {
    const { container } = renderTour([STEPS[0]]);
    stubRect(container.querySelector('[data-tour="a"]') as Element, {
      top: 420,
      left: 96,
      width: 160,
      height: 40,
    });
    await waitFor(() => {
      const spot = screen.getByTestId("tour-spotlight");
      // 6px of padding around the target on every side.
      expect(spot.style.top).toBe("414px");
      expect(spot.style.left).toBe("90px");
      expect(spot.style.width).toBe("172px");
      expect(spot.style.height).toBe("52px");
    });
  });

  it("follows the target when the page scrolls under it", async () => {
    const { container } = renderTour([STEPS[0]]);
    const target = container.querySelector('[data-tour="a"]') as Element;
    stubRect(target, { top: 500, left: 20, width: 100, height: 30 });
    await waitFor(() =>
      expect(screen.getByTestId("tour-spotlight").style.top).toBe("494px"),
    );

    // Scroll the page 300px down: the target's viewport-relative top drops by
    // 300, and the spotlight must move with it rather than staying put. No
    // scroll event is dispatched on purpose — iOS coalesces them away during
    // momentum scrolling, so tracking has to hold without one.
    stubRect(target, { top: 200, left: 20, width: 100, height: 30 });
    await waitFor(() =>
      expect(screen.getByTestId("tour-spotlight").style.top).toBe("194px"),
    );
  });

  it("prefers a rendered target over a hidden duplicate anchor", async () => {
    const { container } = render(
      <div>
        {/* e.g. a mobile-only variant that is display:none on this breakpoint */}
        <span data-tour="dup">hidden</span>
        <button type="button" data-tour="dup">
          shown
        </button>
        <GuidedTour
          tourId="test"
          steps={[{ target: '[data-tour="dup"]', title: "Dup", body: "b" }]}
        />
      </div>,
    );
    const [hidden, shown] = Array.from(
      container.querySelectorAll('[data-tour="dup"]'),
    );
    stubRect(hidden, { top: 0, left: 0, width: 0, height: 0 });
    stubRect(shown, { top: 300, left: 40, width: 120, height: 44 });
    await waitFor(() =>
      expect(screen.getByTestId("tour-spotlight").style.top).toBe("294px"),
    );
  });

  it("shrinks the tooltip to fit a narrow phone viewport", async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      value: 320,
      configurable: true,
    });
    try {
      renderTour([STEPS[0]]);
      const tip = await screen.findByRole("group");
      // 320 design width would overflow a 320px screen; 8px margins each side.
      await waitFor(() => expect(tip.style.width).toBe("304px"));
    } finally {
      Object.defineProperty(window, "innerWidth", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("admin tour config", () => {
  it("targets only data-tour selectors and has content per step", async () => {
    const { ADMIN_TOUR_STEPS, ADMIN_TOUR_ID } = await import("@/lib/adminTour");
    expect(ADMIN_TOUR_ID.length).toBeGreaterThan(0);
    expect(ADMIN_TOUR_STEPS.length).toBeGreaterThan(0);
    for (const step of ADMIN_TOUR_STEPS) {
      expect(step.target.startsWith('[data-tour="')).toBe(true);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it("points every step at an anchor that exists in Admin.tsx", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { ADMIN_TOUR_STEPS } = await import("@/lib/adminTour");
    const src = readFileSync(
      path.join(process.cwd(), "client/src/pages/Admin.tsx"),
      "utf-8",
    );
    for (const step of ADMIN_TOUR_STEPS) {
      // step.target is `[data-tour="name"]` → the source must contain data-tour="name".
      const attr = step.target.slice(1, -1); // strip the [ ]
      expect(src.includes(attr), `Admin.tsx missing anchor: ${attr}`).toBe(
        true,
      );
    }
  });
});
