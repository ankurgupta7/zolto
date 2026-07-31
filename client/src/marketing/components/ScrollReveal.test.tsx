import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScrollReveal } from "./ScrollReveal";

afterEach(cleanup);

describe("ScrollReveal", () => {
  it("renders its children regardless of whether the reveal ever fires", () => {
    // The whole point: the animation is decoration layered over real DOM, so
    // copy is never trapped behind an effect that may not run.
    render(<ScrollReveal>the pledge</ScrollReveal>);
    expect(screen.getByText("the pledge")).toBeTruthy();
  });

  it("renders as the requested element so list semantics survive", () => {
    render(
      <ul>
        <ScrollReveal as="li">a step</ScrollReveal>
      </ul>,
    );
    expect(screen.getByRole("listitem").textContent).toBe("a step");
  });

  it("defaults to a div", () => {
    render(<ScrollReveal>plain</ScrollReveal>);
    expect(screen.getByTestId("scroll-reveal").tagName).toBe("DIV");
  });

  it("applies the caller's classes alongside the transition classes", () => {
    render(<ScrollReveal className="rounded-2xl">boxed</ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.className).toContain("rounded-2xl");
    expect(el.className).toContain("transition-");
  });

  it("stages a stagger delay only once visible", () => {
    // Without an IntersectionObserver (jsdom) the hook reports visible, so the
    // delay should be live rather than pinned at 0.
    render(<ScrollReveal delay={320}>late</ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.getAttribute("data-in-view")).toBe("true");
    expect(el.style.transitionDelay).toBe("320ms");
  });
});
