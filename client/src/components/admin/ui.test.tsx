import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { EmptyState, LoadingState } from "./ui";

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
});
