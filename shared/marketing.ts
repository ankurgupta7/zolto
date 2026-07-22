/**
 * Shared marketing/content constants — the single source of truth for the Zolto
 * marketing surface's publishable content and its SEO sitemap. Imported by both
 * the client (blog/story pages) and the server (sitemap.xml, robots.txt) so the
 * two never drift.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Right-of-publicity gate (business-plan §5.1, phase1/legal/content-release-form.md)
 * ─────────────────────────────────────────────────────────────────────────────
 * The Launch Diary series and the case study are built around a REAL maker —
 * Kalakosh (Sheena Arora, Zurich). Zolto is a separate legal party, and it may not
 * publish her name, likeness, or business story to market the platform until a
 * signed content/publicity release is on file. Until then the same narrative ships
 * with the maker anonymized — exactly the gate already applied to the pricing-page
 * testimonial (client/src/marketing/pages/Pricing.tsx).
 *
 * WHEN THE RELEASE IS SIGNED: flip CONTENT_RELEASE_SIGNED to `true`. Every page,
 * byline, meta tag, JSON-LD block, and the story URL slug then swap to the real
 * identity automatically. Nothing else needs editing to go named.
 *
 * STATUS: signed. The operator confirmed the Kalakosh / Sheena Arora content &
 * publicity release is signed and on file (confirmed 2026-07-22). The scanned
 * release should be committed to docs/planning/phase1/legal/ as the durable
 * record — see the tracker's §5.1 note. Flip back to `false` to re-anonymize.
 */
export const CONTENT_RELEASE_SIGNED = true;

export interface MakerIdentity {
  /** Brand name, or a neutral stand-in while unreleased. */
  brand: string;
  /** Founder's real name — only surfaced once the release is signed. */
  founder: string | null;
  city: string;
  /** ISO 3166-1 alpha-2, for schema.org PostalAddress. */
  countryCode: string;
  countryName: string;
}

const NAMED_MAKER: MakerIdentity = {
  brand: "Kalakosh",
  founder: "Sheena Arora",
  city: "Zurich",
  countryCode: "CH",
  countryName: "Switzerland",
};

const ANON_MAKER: MakerIdentity = {
  brand: "our pilot studio",
  founder: null,
  city: "Zurich",
  countryCode: "CH",
  countryName: "Switzerland",
};

export const maker: MakerIdentity = CONTENT_RELEASE_SIGNED
  ? NAMED_MAKER
  : ANON_MAKER;

/**
 * The case-study URL slug. Brand-named once released; neutral until then so the
 * brand isn't leaked in the URL of an unreleased page. These pages have no live
 * SEO history yet, so the pre-release rename costs nothing.
 */
export const STORY_SLUG = CONTENT_RELEASE_SIGNED
  ? "kalakosh-launch"
  : "pilot-launch";

export interface BlogPostRef {
  slug: string;
  /** ISO date for sitemap <lastmod>. */
  lastmod: string;
}

/**
 * The Launch Diary series, in order. Slugs are brand-neutral so they stay stable
 * across the release gate. The rich body/meta for each lives in
 * client/src/marketing/content/launchContent.ts, keyed by these same slugs.
 */
export const BLOG_POSTS: BlogPostRef[] = [
  { slug: "launch-diary-1", lastmod: "2026-07-20" },
  { slug: "launch-diary-2", lastmod: "2026-07-27" },
  { slug: "launch-diary-3", lastmod: "2026-08-03" },
];

export interface SitemapEntry {
  path: string;
  lastmod: string;
  changefreq: "weekly" | "monthly" | "yearly";
  priority: number;
}

/**
 * The canonical set of indexable marketing URLs. Reflects the routes that are
 * ACTUALLY live (see client/src/marketing/MarketingApp.tsx) — not aspirational
 * ones — so the sitemap never advertises a 404.
 */
export function marketingSitemapEntries(): SitemapEntry[] {
  const storyLastmod = "2026-08-01";
  return [
    { path: "/", lastmod: "2026-07-20", changefreq: "weekly", priority: 1.0 },
    {
      path: "/pricing",
      lastmod: "2026-07-20",
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      path: "/signup",
      lastmod: "2026-07-20",
      changefreq: "monthly",
      priority: 0.8,
    },
    {
      path: "/blog",
      lastmod: "2026-08-03",
      changefreq: "weekly",
      priority: 0.8,
    },
    ...BLOG_POSTS.map(
      (p): SitemapEntry => ({
        path: `/blog/${p.slug}`,
        lastmod: p.lastmod,
        changefreq: "monthly",
        priority: 0.7,
      }),
    ),
    {
      path: `/stories/${STORY_SLUG}`,
      lastmod: storyLastmod,
      changefreq: "monthly",
      priority: 0.8,
    },
    {
      path: "/legal/privacy",
      lastmod: "2026-07-17",
      changefreq: "yearly",
      priority: 0.3,
    },
    {
      path: "/legal/terms",
      lastmod: "2026-07-17",
      changefreq: "yearly",
      priority: 0.3,
    },
  ];
}

/** Absolute canonical base URL, no trailing slash. */
export function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/** Render the sitemap entries as a sitemap.xml document. */
export function renderSitemapXml(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const urls = marketingSitemapEntries()
    .map((e) => {
      const loc = `${base}${e.path === "/" ? "/" : e.path}`;
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${e.lastmod}</lastmod>`,
        `    <changefreq>${e.changefreq}</changefreq>`,
        `    <priority>${e.priority.toFixed(1)}</priority>`,
        "  </url>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Render robots.txt, pointing crawlers at the sitemap. */
export function renderRobotsTxt(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}
