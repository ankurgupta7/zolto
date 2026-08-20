import { describe, it, expect, vi, afterEach } from "vitest";
import { hardRedirect } from "./navigate";

const realLocation = window.location;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * jsdom's own `window.location` refuses assignment (navigation isn't
 * implemented), so each test swaps in a plain stand-in and asserts on it.
 */
function stubLocation() {
  const stub = { href: realLocation.href, replace: vi.fn() };
  vi.stubGlobal("location", stub);
  return stub;
}

describe("hardRedirect", () => {
  it("pushes a new history entry by default", () => {
    const loc = stubLocation();
    hardRedirect("/admin");
    expect(loc.href).toBe("/admin");
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("swaps the current entry when asked to replace", () => {
    const loc = stubLocation();
    const before = loc.href;
    hardRedirect("/admin", { replace: true });
    // Replace must not also write href — that would push an extra entry.
    expect(loc.replace).toHaveBeenCalledWith("/admin");
    expect(loc.href).toBe(before);
  });

  it("carries absolute cross-surface URLs through untouched", () => {
    const loc = stubLocation();
    hardRedirect("https://kalakosh.gwinn.ch/admin", { replace: true });
    expect(loc.replace).toHaveBeenCalledWith("https://kalakosh.gwinn.ch/admin");
  });
});
