/**
 * Turn a store name into a URL slug matching the server's tenantRouter.create
 * validation: /^[a-z0-9-]+$/, length 3–64.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 64);
}

const SLUG_RE = /^[a-z0-9-]+$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 64 && SLUG_RE.test(slug);
}
