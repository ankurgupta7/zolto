import { describe, it, expect } from "vitest";
import { PLATFORM_NAV, isPlatformPath, activePlatformNavId } from "./nav";

describe("isPlatformPath", () => {
  it("claims the console's own paths", () => {
    expect(isPlatformPath("/platform")).toBe(true);
    expect(isPlatformPath("/platform/stores")).toBe(true);
    expect(isPlatformPath("/platform/stores/7")).toBe(true);
  });

  it("leaves the marketing pages alone", () => {
    for (const path of ["/", "/pricing", "/signup", "/blog", "/for/makers"]) {
      expect(isPlatformPath(path)).toBe(false);
    }
  });

  it("does not claim a marketing path that merely starts with the same letters", () => {
    // A future /platforms or /platform-status marketing page must keep
    // rendering inside MarketingShell.
    expect(isPlatformPath("/platforms")).toBe(false);
    expect(isPlatformPath("/platform-status")).toBe(false);
  });
});

describe("activePlatformNavId", () => {
  it("highlights metrics at the console root", () => {
    expect(activePlatformNavId("/platform")).toBe("metrics");
  });

  it("highlights stores on the list and on a single store", () => {
    expect(activePlatformNavId("/platform/stores")).toBe("tenants");
    // The bare /platform prefix would also match here; the longest path wins.
    expect(activePlatformNavId("/platform/stores/7")).toBe("tenants");
  });

  it("returns null off the console", () => {
    expect(activePlatformNavId("/pricing")).toBeNull();
  });
});

describe("PLATFORM_NAV", () => {
  it("has unique ids and paths", () => {
    expect(new Set(PLATFORM_NAV.map((i) => i.id)).size).toBe(
      PLATFORM_NAV.length,
    );
    expect(new Set(PLATFORM_NAV.map((i) => i.path)).size).toBe(
      PLATFORM_NAV.length,
    );
  });

  it("keeps every destination inside the console", () => {
    for (const item of PLATFORM_NAV) {
      expect(isPlatformPath(item.path)).toBe(true);
    }
  });
});
