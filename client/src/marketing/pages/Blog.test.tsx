import { BRAND } from "@shared/brand";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import Blog from "./Blog";
import BlogPost from "./BlogPost";
import Story from "./Story";
import { DIARY_POSTS, CASE_STUDY } from "../content/launchContent";
import {
  getDiaryPosts,
  getCaseStudy,
  getBlogChrome,
} from "../content/localizedContent";

afterEach(async () => {
  cleanup();
  // jsdom's navigator.language is en-US, so the suite's baseline is English —
  // restore it so this file leaves no language behind for other tests.
  await i18n.changeLanguage("en");
  localStorage.removeItem(BRAND.langKey);
});

function renderAt(path: string) {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <Switch>
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/stories/:slug" component={Story} />
      </Switch>
    </Router>,
  );
}

describe("Blog index", () => {
  it("lists every diary post and the case study", () => {
    renderAt("/blog");
    for (const post of DIARY_POSTS) {
      expect(screen.getByText(post.title)).toBeTruthy();
    }
    expect(screen.getByText(CASE_STUDY.title)).toBeTruthy();
  });
});

describe("Blog index — multilingual", () => {
  it("renders German titles and chrome after switching to de", async () => {
    await i18n.changeLanguage("de");
    renderAt("/blog");

    const de = getDiaryPosts("de");
    for (const post of de) {
      expect(screen.getByText(post.title)).toBeTruthy();
    }
    expect(screen.getByText(getCaseStudy("de").title)).toBeTruthy();
    // The German copy is genuinely different, not the English text re-rendered.
    expect(screen.queryByText(DIARY_POSTS[0].title)).toBeNull();

    // Page chrome localizes with it.
    const chrome = getBlogChrome("de");
    expect(
      screen.getByRole("heading", { level: 1, name: chrome.indexTitle }),
    ).toBeTruthy();
    expect(screen.getByText(chrome.indexEyebrow)).toBeTruthy();
    expect(screen.getByText(chrome.caseStudyEyebrow)).toBeTruthy();
  });

  it("keeps slugs and URLs language-independent", async () => {
    await i18n.changeLanguage("fr");
    const { container } = renderAt("/blog");

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    for (const post of DIARY_POSTS) {
      expect(hrefs).toContain(`/blog/${post.slug}`);
    }
    expect(hrefs).toContain(`/stories/${CASE_STUDY.slug}`);
  });

  it("renders an Italian diary post at the same English URL", async () => {
    await i18n.changeLanguage("it");
    const it = getDiaryPosts("it")[0];
    renderAt("/blog/launch-diary-1");

    expect(
      screen.getByRole("heading", { level: 1, name: it.title }),
    ).toBeTruthy();
    const ld = document.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(ld!.textContent!).inLanguage).toBe("it-CH");
  });

  it("renders the French case study and its not-found chrome", async () => {
    await i18n.changeLanguage("fr");
    const fr = getCaseStudy("fr");

    renderAt(`/stories/${CASE_STUDY.slug}`);
    expect(
      screen.getByRole("heading", { level: 1, name: fr.title }),
    ).toBeTruthy();

    cleanup();
    renderAt("/stories/some-other-brand");
    expect(
      screen.getByText(getBlogChrome("fr").storyNotFoundTitle),
    ).toBeTruthy();
  });
});

describe("BlogPost", () => {
  it("renders a known diary post with its H1 and JSON-LD", () => {
    const { container } = renderAt("/blog/launch-diary-1");
    expect(
      screen.getByRole("heading", { level: 1, name: DIARY_POSTS[0].title }),
    ).toBeTruthy();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(ld).not.toBeNull();
    expect(JSON.parse(ld!.textContent!)["@type"]).toBe("Article");
  });

  it("shows a not-found notice for an unknown slug", () => {
    renderAt("/blog/nope");
    expect(screen.getByText(/not found/i)).toBeTruthy();
  });

  // ArticleView wraps every diary post and the case study, so its own chrome
  // (back-link, series labels, byline date) has to follow the language too —
  // it read English-only while the article body around it was translated.
  it("renders the ArticleView chrome in the article's language", async () => {
    await i18n.changeLanguage("de");
    renderAt("/blog/launch-diary-1");
    const de = getBlogChrome("de");
    expect(screen.getByText(de.allDiaryPosts)).toBeTruthy();
    expect(screen.getByText(de.seriesDisclosure)).toBeTruthy();
    // German long dates read "20. Juli 2026", never the en-CH "20 July 2026".
    const byline = screen.getByText(/Juli|Januar|Februar|März/);
    expect(byline).toBeTruthy();
    expect(screen.queryByText(/All Launch Diary posts/)).toBeNull();
  });
});

describe("Story", () => {
  it("renders the case study at its current slug", () => {
    renderAt(`/stories/${CASE_STUDY.slug}`);
    expect(
      screen.getByRole("heading", { level: 1, name: CASE_STUDY.title }),
    ).toBeTruthy();
  });

  it("is not-found at a mismatched slug", () => {
    renderAt("/stories/some-other-brand");
    expect(screen.getByText(/story not found/i)).toBeTruthy();
  });
});
