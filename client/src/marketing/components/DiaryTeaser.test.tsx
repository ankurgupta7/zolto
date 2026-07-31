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
});
