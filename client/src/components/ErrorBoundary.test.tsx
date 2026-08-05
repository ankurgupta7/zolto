import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import i18n from "@/lib/i18n";
import ErrorBoundary from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom from child");
}

// The storefront falls back to German when the browser asks for it; pin
// English so the fallback assertions below read the source strings.
beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en");
  // React logs the caught error; keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeTruthy();
  });

  it("shows the fallback with the error stack when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("An unexpected error occurred.")).toBeTruthy();
    expect(screen.getByText(/kaboom from child/)).toBeTruthy();
  });

  it("recovers by reloading the page from the fallback button", () => {
    // jsdom's window.location is unforgeable, so shadow `location` on a
    // prototype-chained window stub instead of patching reload in place.
    const reload = vi.fn();
    vi.stubGlobal(
      "window",
      Object.create(window, { location: { value: { reload } } }),
    );
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
