import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DIARY_POSTS,
  CASE_STUDY,
  getDiaryPost,
  CURRENT_STORY_SLUG,
  type Article,
  type Block,
  type ImageAsset,
} from "./launchContent";
import { BLOG_POSTS, CONTENT_RELEASE_SIGNED, maker } from "@shared/marketing";

const ALL: Article[] = [...DIARY_POSTS, CASE_STUDY];

/** Collect every ImageAsset referenced by any block. */
function imagesOf(article: Article): ImageAsset[] {
  const out: ImageAsset[] = [];
  for (const block of article.blocks as Block[]) {
    if (block.type === "figure") out.push(block.image);
    if (block.type === "beforeAfter") out.push(block.before, block.after);
  }
  return out;
}

describe("launch content integrity", () => {
  it("has one diary article per BLOG_POSTS entry, in order", () => {
    expect(DIARY_POSTS.map((p) => p.slug)).toEqual(
      BLOG_POSTS.map((p) => p.slug),
    );
  });

  it("gives every article a title, meta title, description, and blocks", () => {
    for (const a of ALL) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.metaTitle.length).toBeGreaterThan(0);
      expect(a.metaDescription.length).toBeGreaterThan(0);
      expect(a.blocks.length).toBeGreaterThan(0);
      expect(a.keywords.length).toBeGreaterThan(0);
    }
  });

  it("keeps meta descriptions within a search-friendly length", () => {
    for (const a of ALL) {
      expect(a.metaDescription.length).toBeLessThanOrEqual(200);
    }
  });

  it("has unique slugs", () => {
    const slugs = ALL.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves getDiaryPost by slug and rejects unknown slugs", () => {
    expect(getDiaryPost("launch-diary-1")).toBe(DIARY_POSTS[0]);
    expect(getDiaryPost("does-not-exist")).toBeUndefined();
  });

  it("well-forms every table block (rows match header width)", () => {
    for (const a of ALL) {
      for (const block of a.blocks) {
        if (block.type === "table") {
          for (const row of block.rows) {
            expect(row.length).toBe(block.head.length);
          }
        }
      }
    }
  });

  it("chains the diary series with valid next-links", () => {
    // Diary 1 → 2 → 3 → story
    expect(DIARY_POSTS[0].next?.href).toBe("/blog/launch-diary-2");
    expect(DIARY_POSTS[1].next?.href).toBe("/blog/launch-diary-3");
    expect(DIARY_POSTS[2].next?.href).toBe(`/stories/${CURRENT_STORY_SLUG}`);
  });
});

describe("image blocks", () => {
  const referenced = ALL.flatMap(imagesOf);

  it("gives every image a root-relative src and non-empty alt text", () => {
    expect(referenced.length).toBeGreaterThan(0);
    for (const img of referenced) {
      expect(img.src.startsWith("/launch/")).toBe(true);
      expect(img.alt.trim().length).toBeGreaterThan(0);
    }
  });

  it("references image files that exist in client/public", () => {
    // vitest root is the repo root; public assets live under client/public.
    for (const img of referenced) {
      const onDisk = path.join(process.cwd(), "client", "public", img.src);
      expect(existsSync(onDisk), `missing asset: ${img.src}`).toBe(true);
    }
  });

  it("pairs a maker phone photo with an AI-styled counterpart in diary #1", () => {
    const pairs = (DIARY_POSTS[0].blocks as Block[]).filter(
      (b): b is Extract<Block, { type: "beforeAfter" }> =>
        b.type === "beforeAfter",
    );
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    for (const p of pairs) {
      // Every AI-styled/on-model image must carry a disclosure in its caption.
      expect(p.caption?.toLowerCase()).toContain("ai-generated");
    }
  });
});

describe("JSON-LD schema", () => {
  it("marks each article as schema.org Article with a Gwinn publisher", () => {
    for (const a of ALL) {
      expect(a.schema["@context"]).toBe("https://schema.org");
      expect(a.schema["@type"]).toBe("Article");
      expect(a.schema.author).toMatchObject({ name: "Gwinn" });
    }
  });

  it("describes the maker as a Zurich LocalBusiness", () => {
    for (const a of ALL) {
      const about = a.schema.about as Record<string, unknown>;
      expect(about["@type"]).toBe("LocalBusiness");
      const address = about.address as Record<string, unknown>;
      expect(address.addressLocality).toBe("Zurich");
      expect(address.addressCountry).toBe("CH");
    }
  });
});

describe("right-of-publicity gate in content", () => {
  it("never leaks the founder's name while the release is unsigned", () => {
    if (CONTENT_RELEASE_SIGNED) return; // named mode is allowed once signed

    const haystack = JSON.stringify(ALL).toLowerCase();
    expect(haystack).not.toContain("sheena");
    expect(haystack).not.toContain("kalakosh");
    // The story slug must also be brand-neutral pre-release.
    expect(CURRENT_STORY_SLUG).not.toContain("kalakosh");
    // No schema should assert a named Person founder.
    for (const a of ALL) {
      const about = a.schema.about as Record<string, unknown>;
      expect(about.founder).toBeUndefined();
    }
  });

  it("names the maker and asserts a Person founder once the release is signed", () => {
    if (!CONTENT_RELEASE_SIGNED) return; // anonymized mode covered above

    const haystack = JSON.stringify(ALL);
    expect(haystack).toContain(maker.brand);
    if (maker.founder) {
      expect(haystack).toContain(maker.founder);
      // Schema now carries a named Person founder.
      for (const a of ALL) {
        const about = a.schema.about as Record<string, unknown>;
        expect(about.founder).toMatchObject({
          "@type": "Person",
          name: maker.founder,
        });
      }
    }
    // Story slug is brand-named once released.
    expect(CURRENT_STORY_SLUG).toBe("kalakosh-launch");
  });
});
