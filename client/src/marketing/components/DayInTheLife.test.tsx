import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { SELLING_FLOW } from "@shared/platform";
import { DayInTheLife } from "./DayInTheLife";

afterEach(cleanup);

describe("DayInTheLife", () => {
  it("tells the whole selling loop, in order, from the shared data", () => {
    render(<DayInTheLife />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(SELLING_FLOW.length);

    SELLING_FLOW.forEach((step, i) => {
      expect(within(items[i]).getByText(step.title)).toBeTruthy();
      expect(within(items[i]).getByText(step.detail)).toBeTruthy();
    });
  });

  it("anchors each step to a time of day so it reads as one market day", () => {
    render(<DayInTheLife />);
    for (const step of SELLING_FLOW) {
      expect(screen.getByText(step.timeOfDay)).toBeTruthy();
    }
  });

  it("keeps the steps as real list semantics, not styled divs", () => {
    render(<DayInTheLife />);
    // An ordered list is what conveys "these happen in sequence" to a
    // screen reader; the gold spine is only a visual restatement of it.
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it("renders every step's copy even before anything scrolls into view", () => {
    // jsdom has no IntersectionObserver, which is exactly the degraded case:
    // the copy must be in the DOM regardless of whether the reveal ever fires.
    render(<DayInTheLife />);
    expect(screen.getByText(SELLING_FLOW[2].title)).toBeTruthy();
  });

  it("marks the progress spine decorative so it isn't announced", () => {
    const { container } = render(<DayInTheLife />);
    const spine = container.querySelector('[data-testid="day-spine"]');
    expect(spine).toBeTruthy();
    expect(spine?.getAttribute("aria-hidden")).toBe("true");
  });
});
