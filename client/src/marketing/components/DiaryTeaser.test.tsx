import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DIARY_POSTS } from "../content/launchContent";
import { DiaryTeaser } from "./DiaryTeaser";

afterEach(cleanup);

function renderTeaser() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <DiaryTeaser />
    </Router>,
  );
}

describe("DiaryTeaser", () => {
  it("surfaces every diary post from the shared content", () => {
    renderTeaser();
    for (const post of DIARY_POSTS) {
      expect(screen.getByText(post.title)).toBeTruthy();
      expect(screen.getByText(post.dek)).toBeTruthy();
    }
  });

  it("links each card to its post and offers the full index", () => {
    renderTeaser();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    for (const post of DIARY_POSTS) {
      expect(hrefs).toContain(`/blog/${post.slug}`);
    }
    expect(hrefs).toContain("/blog");
  });

  it("quotes nobody — the withheld testimonial must not leak onto the homepage", () => {
    // The named maker quote is gated behind a signed publicity release, and the
    // anonymized stand-in was removed for reading as unfinished. Neither belongs
    // here, so the teaser should carry no quotation and no pending-release caption.
    const { container } = renderTeaser();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/pending release/i);
    expect(text).not.toMatch(/testimonial/i);
    expect(text).not.toContain("“"); // no curly open-quote
  });

  it("keeps the cards as a real list", () => {
    renderTeaser();
    expect(screen.getAllByRole("listitem")).toHaveLength(DIARY_POSTS.length);
  });

  // `dense` is the homepage-reel rendering: the chapter owns the band, the
  // gutter and the vertical rhythm. It is padding and framing only — a variant
  // that quietly dropped content would make the reel a content cut.
  it("keeps every post, and its staggered reveal, in its dense reel rendering", () => {
    const { hook } = memoryLocation({ path: "/", static: true });
    const { container } = render(
      <Router hook={hook}>
        <DiaryTeaser dense />
      </Router>,
    );
    expect(container.querySelector("section")).toBeNull();
    for (const post of DIARY_POSTS) {
      expect(screen.getByText(post.title)).toBeTruthy();
    }
    // The cards are not the first thing in the closing chapter, so they keep
    // the reveal the rest of the surface uses.
    expect(screen.getAllByTestId("scroll-reveal").length).toBe(
      DIARY_POSTS.length,
    );
  });

  it("nests no swipe row inside the reel's own carousel", () => {
    // In the reel the panel around this IS a horizontal snap track: a scroller
    // inside a scroller eats the gesture. Dense stacks the posts as compact
    // rows instead, and every reading time and link is still there.
    const { hook } = memoryLocation({ path: "/", static: true });
    const { container } = render(
      <Router hook={hook}>
        <DiaryTeaser dense />
      </Router>,
    );
    expect(container.querySelectorAll('[class*="overflow-x"]').length).toBe(0);
    expect(container.querySelectorAll('[class*="snap-"]').length).toBe(0);
    for (const post of DIARY_POSTS) {
      expect(screen.getByText(post.readingTime)).toBeTruthy();
      expect(screen.getByText(post.dek)).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: new RegExp(post.title, "i") })
          .getAttribute("href"),
      ).toBe(`/blog/${post.slug}`);
    }
  });
});
