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
      <button data-tour="a">A</button>
      <button data-tour="b">B</button>
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
