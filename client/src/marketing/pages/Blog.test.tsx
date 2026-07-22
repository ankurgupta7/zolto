import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Blog from "./Blog";
import BlogPost from "./BlogPost";
import Story from "./Story";
import { DIARY_POSTS, CASE_STUDY } from "../content/launchContent";

afterEach(cleanup);

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
