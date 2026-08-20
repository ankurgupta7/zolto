import { describe, it, expect } from "vitest";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/languages";
import {
  DIARY_POSTS,
  CASE_STUDY,
  CURRENT_STORY_SLUG,
  type Article,
  type Block,
} from "./launchContent";
import {
  getDiaryPosts,
  getCaseStudy,
  getArticleBySlug,
  getAllArticles,
  getBlogChrome,
  formatArticleDate,
  ARTICLE_DATE_LOCALE,
  BLOG_CHROME,
  type BlogChrome,
} from "./localizedContent";

const TRANSLATED: SupportedLanguage[] = ["de", "fr", "it"];
const EN_ARTICLES: Article[] = [...DIARY_POSTS, CASE_STUDY];

/**
 * Every user-visible string inside a block, in a stable order, so a
 * translation can be compared against its English counterpart position by
 * position. Image srcs are deliberately included: they are part of the parity
 * contract (identical assets), unlike alt text which must be translated.
 */
function blockStrings(b: Block): string[] {
  switch (b.type) {
    case "p":
    case "h2":
    case "note":
      return [b.text];
    case "ul":
    case "ol":
      return b.items;
    case "quote":
      return [b.text, b.cite ?? ""];
    case "table":
      return [...b.head, ...b.rows.flat(), b.caption ?? ""];
    case "figure":
      return [b.image.alt, b.caption ?? ""];
    case "beforeAfter":
      return [
        b.before.alt,
        b.after.alt,
        b.beforeLabel ?? "",
        b.afterLabel ?? "",
        b.caption ?? "",
      ];
  }
}

/** Image srcs referenced by a block, in order. */
function blockImageSrcs(b: Block): string[] {
  if (b.type === "figure") return [b.image.src];
  if (b.type === "beforeAfter") return [b.before.src, b.after.src];
  return [];
}

describe("localized content resolution", () => {
  it("covers every supported language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(getDiaryPosts(lang).length).toBe(DIARY_POSTS.length);
      expect(getCaseStudy(lang)).toBeDefined();
      expect(getBlogChrome(lang)).toBeDefined();
    }
  });

  it("returns the untouched English objects for en", () => {
    // Identity, not just equality — English must be byte-for-byte what it was
    // before the editorial surface became multilingual.
    expect(getDiaryPosts("en")).toBe(DIARY_POSTS);
    expect(getCaseStudy("en")).toBe(CASE_STUDY);
    expect(getArticleBySlug("launch-diary-1", "en")).toBe(DIARY_POSTS[0]);
    expect(getArticleBySlug(CURRENT_STORY_SLUG, "en")).toBe(CASE_STUDY);
  });

  it("exposes the same slugs, in the same order, in all four languages", () => {
    const enSlugs = EN_ARTICLES.map((a) => a.slug);
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(getAllArticles(lang).map((a) => a.slug)).toEqual(enSlugs);
    }
  });

  it("resolves any article by its language-independent slug", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const en of EN_ARTICLES) {
        const found = getArticleBySlug(en.slug, lang);
        expect(found, `${lang}/${en.slug}`).toBeDefined();
        expect(found!.slug).toBe(en.slug);
      }
      expect(getArticleBySlug("does-not-exist", lang)).toBeUndefined();
    }
  });
});

describe("structural parity with the English source", () => {
  for (const lang of TRANSLATED) {
    describe(lang, () => {
      it("keeps kind, dates, reading-time shape and next-link hrefs", () => {
        for (const en of EN_ARTICLES) {
          const t = getArticleBySlug(en.slug, lang)!;
          expect(t.kind, en.slug).toBe(en.kind);
          expect(t.datePublished, en.slug).toBe(en.datePublished);
          expect(t.dateModified, en.slug).toBe(en.dateModified);
          expect(t.next?.href, en.slug).toBe(en.next?.href);
          // An eyebrow exists iff the English article has one.
          expect(Boolean(t.eyebrow), en.slug).toBe(Boolean(en.eyebrow));
        }
      });

      it("has an identical block count and block-type sequence per article", () => {
        for (const en of EN_ARTICLES) {
          const t = getArticleBySlug(en.slug, lang)!;
          expect(t.blocks.length, en.slug).toBe(en.blocks.length);
          expect(
            t.blocks.map((b) => b.type),
            en.slug,
          ).toEqual(en.blocks.map((b) => b.type));
        }
      });

      it("references exactly the same image assets", () => {
        for (const en of EN_ARTICLES) {
          const t = getArticleBySlug(en.slug, lang)!;
          expect(t.blocks.flatMap(blockImageSrcs), en.slug).toEqual(
            en.blocks.flatMap(blockImageSrcs),
          );
        }
      });

      it("keeps table rows as wide as their header", () => {
        for (const en of EN_ARTICLES) {
          for (const block of getArticleBySlug(en.slug, lang)!.blocks) {
            if (block.type !== "table") continue;
            for (const row of block.rows) {
              expect(row.length, `${en.slug} ${lang}`).toBe(block.head.length);
            }
          }
        }
      });

      it("has no empty translated strings where English has text", () => {
        for (const en of EN_ARTICLES) {
          const t = getArticleBySlug(en.slug, lang)!;
          expect(t.title.trim().length, en.slug).toBeGreaterThan(0);
          expect(t.dek.trim().length, en.slug).toBeGreaterThan(0);
          expect(t.metaTitle.trim().length, en.slug).toBeGreaterThan(0);
          expect(t.metaDescription.trim().length, en.slug).toBeGreaterThan(0);
          expect(t.readingTime.trim().length, en.slug).toBeGreaterThan(0);
          expect(t.keywords.length, en.slug).toBe(en.keywords.length);
          for (const kw of t.keywords)
            expect(kw.trim().length).toBeGreaterThan(0);

          t.blocks.forEach((block, i) => {
            const mine = blockStrings(block);
            const theirs = blockStrings(en.blocks[i]);
            expect(mine.length, `${en.slug} block ${i}`).toBe(theirs.length);
            mine.forEach((s, j) => {
              // A string English fills must not be blank in translation.
              if (theirs[j].trim().length > 0) {
                expect(
                  s.trim().length,
                  `${lang} ${en.slug} block ${i} string ${j}`,
                ).toBeGreaterThan(0);
              }
            });
          });
        }
      });

      it("keeps meta descriptions search-friendly", () => {
        for (const en of EN_ARTICLES) {
          const t = getArticleBySlug(en.slug, lang)!;
          expect(t.metaDescription.length, en.slug).toBeLessThanOrEqual(200);
        }
      });
    });
  }
});

describe("the translations are genuinely translated", () => {
  for (const lang of TRANSLATED) {
    it(`gives ${lang} its own title, dek, meta and eyebrow`, () => {
      for (const en of EN_ARTICLES) {
        const t = getArticleBySlug(en.slug, lang)!;
        expect(t.title, `${lang} ${en.slug} title`).not.toBe(en.title);
        expect(t.dek, `${lang} ${en.slug} dek`).not.toBe(en.dek);
        expect(t.metaTitle, `${lang} ${en.slug} metaTitle`).not.toBe(
          en.metaTitle,
        );
        expect(
          t.metaDescription,
          `${lang} ${en.slug} metaDescription`,
        ).not.toBe(en.metaDescription);
        expect(t.readingTime, `${lang} ${en.slug}`).not.toBe(en.readingTime);
        if (en.eyebrow) {
          expect(t.eyebrow, `${lang} ${en.slug} eyebrow`).not.toBe(en.eyebrow);
        }
        if (en.next) {
          expect(t.next?.label, `${lang} ${en.slug} next`).not.toBe(
            en.next.label,
          );
        }
      }
    });

    it(`translates the prose blocks in ${lang}`, () => {
      for (const en of EN_ARTICLES) {
        const t = getArticleBySlug(en.slug, lang)!;
        t.blocks.forEach((block, i) => {
          // Prose blocks carry sentences, so an exact match with English is a
          // missed translation rather than a legitimate cognate (unlike table
          // cells, which are often bare numbers or "CHF 61").
          if (
            block.type === "p" ||
            block.type === "h2" ||
            block.type === "note"
          ) {
            const enBlock = en.blocks[i] as typeof block;
            expect(block.text, `${lang} ${en.slug} block ${i}`).not.toBe(
              enBlock.text,
            );
          }
        });
      }
    });
  }

  it("writes German with Swiss orthography (ss, never ß)", () => {
    for (const a of getAllArticles("de")) {
      expect(JSON.stringify(a), a.slug).not.toContain("ß");
    }
    for (const value of Object.values(BLOG_CHROME.de)) {
      expect(value).not.toContain("ß");
    }
  });
});

describe("JSON-LD", () => {
  it("tags every article with its own inLanguage", () => {
    const expected: Record<SupportedLanguage, string> = {
      de: "de-CH",
      en: "en",
      fr: "fr-CH",
      it: "it-CH",
    };
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const a of getAllArticles(lang)) {
        expect(a.schema.inLanguage, `${lang} ${a.slug}`).toBe(expected[lang]);
      }
    }
  });

  it("leaves everything but headline, description and inLanguage identical to English", () => {
    for (const lang of TRANSLATED) {
      for (const en of EN_ARTICLES) {
        const t = getArticleBySlug(en.slug, lang)!;
        const strip = (s: Record<string, unknown>) => {
          const { headline, description, inLanguage, ...rest } = s;
          void headline;
          void description;
          void inLanguage;
          return rest;
        };
        expect(strip(t.schema), `${lang} ${en.slug}`).toEqual(strip(en.schema));
        // The canonical @id — and therefore the URL — never changes.
        expect(
          (t.schema.mainEntityOfPage as Record<string, unknown>)["@id"],
        ).toBe((en.schema.mainEntityOfPage as Record<string, unknown>)["@id"]);
      }
    }
  });

  it("keeps English JSON-LD exactly as the source module built it", () => {
    for (const a of getAllArticles("en")) {
      expect(a.schema.inLanguage).toBe("en");
    }
  });
});

describe("per-article fallback to English", () => {
  /**
   * Simulates a translation set that is missing one article — the state right
   * after a new diary post lands but before its translation does. The rest of
   * the index must stay translated; only the gap renders in English.
   */
  function resolveWithGap(
    translated: Article[],
    missingSlug: string,
  ): Article[] {
    const partial = translated.filter((a) => a.slug !== missingSlug);
    return DIARY_POSTS.map(
      (en) => partial.find((t) => t.slug === en.slug) ?? en,
    );
  }

  it("falls back one article at a time, not the whole set", () => {
    const de = getDiaryPosts("de");
    const resolved = resolveWithGap(de, "launch-diary-2");

    expect(resolved.map((a) => a.slug)).toEqual(DIARY_POSTS.map((a) => a.slug));
    // The gap is English…
    expect(resolved[1].title).toBe(DIARY_POSTS[1].title);
    expect(resolved[1].schema.inLanguage).toBe("en");
    // …while its neighbours stay German.
    expect(resolved[0].title).toBe(de[0].title);
    expect(resolved[2].title).toBe(de[2].title);
    expect(resolved[0].schema.inLanguage).toBe("de-CH");
  });

  it("keeps every slug resolvable even when a translation is absent", () => {
    const resolved = resolveWithGap(getDiaryPosts("fr"), "launch-diary-3");
    for (const en of DIARY_POSTS) {
      expect(resolved.find((a) => a.slug === en.slug)).toBeDefined();
    }
  });
});

describe("page chrome", () => {
  const KEYS: (keyof BlogChrome)[] = [
    "indexMetaTitle",
    "indexMetaDescription",
    "indexEyebrow",
    "indexTitle",
    "indexIntro",
    "caseStudyEyebrow",
    "postNotFoundTitle",
    "postNotFoundBody",
    "backToAllPosts",
    "storyNotFoundTitle",
    "backToDiary",
    "allDiaryPosts",
    "nextInSeries",
    "seriesDisclosure",
  ];

  it("fills every key in every language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const chrome = getBlogChrome(lang);
      for (const key of KEYS) {
        expect(chrome[key].trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("differs from English in de, fr and it", () => {
    for (const lang of TRANSLATED) {
      const chrome = getBlogChrome(lang);
      for (const key of KEYS) {
        expect(chrome[key], `${lang}.${key}`).not.toBe(BLOG_CHROME.en[key]);
      }
    }
  });

  it("keeps the English chrome exactly as the page had it inlined", () => {
    expect(BLOG_CHROME.en.indexMetaTitle).toBe(
      "Launch Diary — A Maker's First Online Store | Gwinn",
    );
    expect(BLOG_CHROME.en.indexEyebrow).toBe("The Launch Diary");
    expect(BLOG_CHROME.en.indexTitle).toBe(
      "A maker's first online store, documented.",
    );
    expect(BLOG_CHROME.en.caseStudyEyebrow).toBe("Case Study");
    expect(BLOG_CHROME.en.postNotFoundTitle).toBe("Post not found");
    expect(BLOG_CHROME.en.postNotFoundBody).toBe(
      "That Launch Diary entry doesn't exist (yet).",
    );
    expect(BLOG_CHROME.en.backToAllPosts).toBe("← Back to all posts");
    expect(BLOG_CHROME.en.storyNotFoundTitle).toBe("Story not found");
    expect(BLOG_CHROME.en.backToDiary).toBe("← Back to the Launch Diary");
  });

  it("keeps the back-links pointing back with an arrow in every language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const chrome = getBlogChrome(lang);
      expect(chrome.backToAllPosts.startsWith("←"), lang).toBe(true);
      expect(chrome.backToDiary.startsWith("←"), lang).toBe(true);
    }
  });
});

describe("date formatting", () => {
  it("uses the language's Swiss locale", () => {
    expect(ARTICLE_DATE_LOCALE).toEqual({
      de: "de-CH",
      en: "en-CH",
      fr: "fr-CH",
      it: "it-CH",
    });
    for (const lang of SUPPORTED_LANGUAGES) {
      const iso = DIARY_POSTS[0].datePublished;
      expect(formatArticleDate(iso, lang)).toBe(
        new Date(iso).toLocaleDateString(ARTICLE_DATE_LOCALE[lang], {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      );
    }
  });

  it("reproduces the existing en-CH long date for English", () => {
    const iso = DIARY_POSTS[0].datePublished;
    expect(formatArticleDate(iso, "en")).toBe(
      new Date(iso).toLocaleDateString("en-CH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  });

  it("renders a different month name in German than in English", () => {
    // Guards against every language silently collapsing to one locale.
    const iso = "2026-01-15";
    expect(formatArticleDate(iso, "de")).not.toBe(formatArticleDate(iso, "en"));
    expect(formatArticleDate(iso, "fr")).not.toBe(formatArticleDate(iso, "en"));
    expect(formatArticleDate(iso, "it")).not.toBe(formatArticleDate(iso, "en"));
  });
});
