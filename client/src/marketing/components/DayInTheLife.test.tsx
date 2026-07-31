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

  it("draws one line-art scene per beat of the day", () => {
    const { container } = render(<DayInTheLife />);
    const scenes = container.querySelectorAll(".sketch-draw");
    expect(scenes).toHaveLength(SELLING_FLOW.length);
  });

  it("gives each beat its own draw trigger, so they ink in one at a time", () => {
    const { container } = render(<DayInTheLife />);
    const beats = container.querySelectorAll('[data-testid="day-beat"]');
    expect(beats).toHaveLength(SELLING_FLOW.length);
    // Each beat owns a data-drawn flag rather than inheriting one from the
    // list, which is what lets the sequence follow the reader down the page.
    for (const beat of Array.from(beats)) {
      expect(beat.getAttribute("data-drawn")).toBeTruthy();
    }
  });

  it("keeps the drawings out of the accessibility tree entirely", () => {
    const { container } = render(<DayInTheLife />);
    for (const svg of Array.from(container.querySelectorAll("svg"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
