/**
 * Primitives for rewriting the served index.html <head> before it goes out.
 *
 * Zolto serves one shared SPA shell for the marketing surface and every tenant
 * storefront, so "what this page is" has to be stamped into the HTML per request
 * — search and AI crawlers that don't execute JavaScript see only what's here.
 * Both server/marketingSeo.ts and server/storefrontSeo.ts build on these.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Replace a meta tag's content by name/property (no-op if the tag is absent). */
export function setMetaContent(
  html: string,
  attr: "name" | "property",
  key: string,
  value: string,
): string {
  const re = new RegExp(
    `(<meta\\s+${attr}=["']${key}["']\\s+content=["'])[^"']*(["'])`,
    "i",
  );
  return html.replace(re, `$1${escapeHtml(value)}$2`);
}

export function setTitle(html: string, title: string): string {
  return html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`,
  );
}

/** Append raw markup immediately before </head>. */
export function appendToHead(html: string, markup: string): string {
  return html.replace(/<\/head>/i, `${markup}</head>`);
}

/** Append raw markup immediately after the SPA mount point. */
export function appendAfterRoot(html: string, markup: string): string {
  return html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root"></div>${markup}`,
  );
}

/** Serialize JSON-LD nodes as <script type="application/ld+json"> tags. */
export function renderJsonLd(nodes: Record<string, unknown>[]): string {
  return nodes
    .map(
      (node) =>
        `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          ...node,
        })}</script>`,
    )
    .join("");
}
