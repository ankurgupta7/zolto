import { useEffect } from "react";

export interface DocumentMeta {
  title: string;
  description?: string;
  /** Canonical/OG URL path, e.g. "/blog/launch-diary-1". */
  path?: string;
  /**
   * Keep the page out of search results (404s, and anything else that isn't a
   * real destination). Also suppresses the canonical link and og:url: a page
   * that shouldn't be indexed has no canonical address to advertise, and
   * pointing one at a mistyped URL is worse than emitting none.
   */
  noindex?: boolean;
}

/** Read or create a <meta name=".."> / <meta property=".."> and return a restorer. */
function setMetaTag(
  attr: "name" | "property",
  key: string,
  value: string,
): () => void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !el;
  const previous = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
  return () => {
    if (!el) return;
    if (created) {
      el.remove();
    } else if (previous !== null) {
      el.setAttribute("content", previous);
    }
  };
}

function setCanonical(href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  const created = !el;
  const previous = el?.getAttribute("href") ?? null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return () => {
    if (!el) return;
    if (created) {
      el.remove();
    } else if (previous !== null) {
      el.setAttribute("href", previous);
    }
  };
}

/**
 * Manage the document <head> for a marketing page: title, meta description, and
 * OG/canonical tags. Restores the prior values on unmount so SPA navigation
 * between pages doesn't leave stale metadata behind. This is the project's
 * lightweight stand-in for react-helmet (not a dependency here).
 */
export function useDocumentMeta({
  title,
  description,
  path,
  noindex,
}: DocumentMeta): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const restorers: Array<() => void> = [];
    restorers.push(setMetaTag("property", "og:title", title));
    restorers.push(setMetaTag("property", "og:type", "article"));

    if (description) {
      restorers.push(setMetaTag("name", "description", description));
      restorers.push(setMetaTag("property", "og:description", description));
    }
    if (noindex) {
      restorers.push(setMetaTag("name", "robots", "noindex, follow"));
    }
    if (path && !noindex) {
      const origin =
        typeof window !== "undefined" && window.location
          ? window.location.origin
          : "";
      const url = `${origin}${path}`;
      restorers.push(setMetaTag("property", "og:url", url));
      restorers.push(setCanonical(url));
    }

    return () => {
      document.title = previousTitle;
      // Restore in reverse so nested creations unwind cleanly.
      for (let i = restorers.length - 1; i >= 0; i--) restorers[i]();
    };
  }, [title, description, path, noindex]);
}
