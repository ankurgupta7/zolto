import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useDocumentMeta } from "./useDocumentMeta";

afterEach(() => {
  cleanup();
  // Reset head between tests.
  document.head.querySelectorAll("meta, link[rel=canonical]").forEach((el) => {
    if (
      el.getAttribute("name") === "description" ||
      el.getAttribute("name") === "robots" ||
      el.getAttribute("property")?.startsWith("og:") ||
      el.getAttribute("rel") === "canonical"
    ) {
      el.remove();
    }
  });
});

describe("useDocumentMeta", () => {
  it("sets the document title and restores it on unmount", () => {
    document.title = "Original";
    const { unmount } = renderHook(() =>
      useDocumentMeta({ title: "New Page Title" }),
    );
    expect(document.title).toBe("New Page Title");
    unmount();
    expect(document.title).toBe("Original");
  });

  it("sets the meta description and og tags", () => {
    renderHook(() =>
      useDocumentMeta({
        title: "T",
        description: "A discoverable description.",
        path: "/blog/launch-diary-1",
      }),
    );
    const desc = document.head.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    expect(desc?.getAttribute("content")).toBe("A discoverable description.");
    const ogTitle = document.head.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]',
    );
    expect(ogTitle?.getAttribute("content")).toBe("T");
    const ogDesc = document.head.querySelector<HTMLMetaElement>(
      'meta[property="og:description"]',
    );
    expect(ogDesc?.getAttribute("content")).toBe("A discoverable description.");
  });

  it("sets a canonical link with the current origin + path", () => {
    renderHook(() =>
      useDocumentMeta({ title: "T", path: "/stories/pilot-launch" }),
    );
    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    expect(canonical?.getAttribute("href")).toContain("/stories/pilot-launch");
  });

  it("marks a page noindex when asked", () => {
    renderHook(() => useDocumentMeta({ title: "Gone", noindex: true }));
    expect(
      document.head
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toBe("noindex, follow");
  });

  it("suppresses the canonical link on a noindex page", () => {
    // A 404 has no real address; advertising one for a mistyped URL is worse
    // than emitting none at all.
    renderHook(() =>
      useDocumentMeta({ title: "Gone", path: "/404", noindex: true }),
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull();
  });

  it("leaves indexable pages untouched by default", () => {
    renderHook(() => useDocumentMeta({ title: "T", path: "/pricing" }));
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull();
  });

  it("removes tags it created when unmounted", () => {
    const { unmount } = renderHook(() =>
      useDocumentMeta({ title: "T", description: "desc", path: "/blog" }),
    );
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).not.toBeNull();
    unmount();
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
