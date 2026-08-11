import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  MAKER_PITCH,
  SOVEREIGNTY,
  AI_NATIVE_PITCH,
  POSITIONING,
} from "@shared/platform";
import en from "../locales/en.json";
import Landing from "./Landing";

afterEach(cleanup);

function renderLanding() {
  const { hook } = memoryLocation({ path: "/", static: true });
  return render(
    <Router hook={hook}>
      <Landing />
    </Router>,
  );
}

/**
 * The eight posts, in order, and how many slides each is made of. A slide is one
 * screen: on a phone you flick down through eight posts and swipe sideways
 * through 18 slides; on a roomy desktop each post's slides become its columns
 * and the page is eight screens. The counts are asserted because a post that
 * lost a slide would silently lose a screenful of the homepage — and because
 * "one claim per post, never more than three screens" is the grouping this page
 * is built on, which the max below states outright.
 */
const CHAPTERS = {
  promise: 1,
  // One slide: the argument shrank to a sentence and the tills became a
  // matrix, so both fit a phone screen together — see Landing.tsx.
  squeeze: 1,
  "free-in-person": 2,
  product: 3,
  costs: 2,
  trust: 3,
  "whats-coming": 3,
  "start-free": 2,
} as const;
const CHAPTER_IDS = Object.keys(CHAPTERS) as Array<keyof typeof CHAPTERS>;

function chapter(id: keyof typeof CHAPTERS) {
  const el = document.querySelector<HTMLElement>(`[data-reel-chapter="${id}"]`);
  if (!el) throw new Error(`no chapter "${id}" on the page`);
  return el;
}

/**
 * Landing copy that left the homepage when it became a reel. Asserted absent
 * here and present in the sub-page's own test — the bands moved, they were not
 * dropped. See the doc comment on Landing for the whole map.
 */
const MOVED_KEYS = {
  // → pages/WhyZolto.tsx, with AgentProofBand and HowAnAiBuys
  emailFrom: "ambiguous",
  emailSubjectLabel: "ambiguous",
  emailConfirm: "ambiguous",
  emailItem1Name: "ambiguous",
  emailItem1Meta: "ambiguous",
  emailItem2Name: "ambiguous",
  emailItem2Meta: "ambiguous",
  emailSubject: "distinctive",
  emailBody: "distinctive",
  // → pages/Compare.tsx (the /compare index), with INCUMBENT_COMPARISON
  comparisonEyebrow: "distinctive",
  comparisonHeading: "distinctive",
  comparisonBody: "distinctive",
  colOldGuard: "distinctive",
} as const;

/** The flat, string-valued half of the `landing` locale group. */
const LANDING_STRINGS: Record<string, string> = Object.fromEntries(
  Object.entries(en.landing).filter(([, v]) => typeof v === "string"),
) as Record<string, string>;

describe("Landing — the reel", () => {
  it("is eight posts, in order, each a named section with a heading", () => {
    renderLanding();
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reel-chapter]"),
    );
    expect(sections.map((s) => s.getAttribute("data-reel-chapter"))).toEqual([
      ...CHAPTER_IDS,
    ]);
    for (const section of sections) {
      expect(section.tagName).toBe("SECTION");
      // A section with no accessible name is a landmark nobody can navigate to.
      expect(section.getAttribute("aria-label")).toBeTruthy();
      expect(
        section.querySelector("h1, h2"),
        `${section.id} has no heading`,
      ).toBeTruthy();
    }
  });

  it("builds each chapter from panels, one screen each", () => {
    renderLanding();
    for (const [id, count] of Object.entries(CHAPTERS)) {
      const panels = chapter(id as keyof typeof CHAPTERS).querySelectorAll(
        "[data-reel-panel]",
      );
      expect(panels.length, `${id} panel count`).toBe(count);
      for (const panel of Array.from(panels)) {
        // Every panel is a snap target in its own right — that is what makes
        // the reel work on a phone, where a whole chapter is ~3 screens tall.
        expect(panel.className).toContain("snap-start");
      }
    }
    // 17 screens on a phone; eight posts' worth of columns on a desktop.
    expect(document.querySelectorAll("[data-reel-panel]").length).toBe(17);
    // The grouping rule, asserted rather than described: one claim per post, and
    // never more than three swipes to have read all of it.
    for (const [id, count] of Object.entries(CHAPTERS)) {
      expect(count, `${id} is deeper than three screens`).toBeLessThanOrEqual(
        3,
      );
    }
  });

  it("pages each post sideways, with a dot per slide and no nested scroller", () => {
    renderLanding();
    const slideLabel = (n: number, total: number) =>
      en.landing.reel.slide
        .replace("{{n}}", String(n))
        .replace("{{total}}", String(total));

    for (const [id, count] of Object.entries(CHAPTERS)) {
      const post = chapter(id as keyof typeof CHAPTERS);
      const dots = post.querySelector<HTMLElement>('[data-testid="reel-dots"]');
      if (count === 1) {
        // A one-slide post has nothing to page through, and a lone dot would
        // suggest there is more sideways than there is.
        expect(dots, `${id} should have no dots`).toBeNull();
        continue;
      }
      expect(dots, `${id} has no dots`).toBeTruthy();
      const buttons = Array.from(dots!.querySelectorAll("button"));
      expect(buttons.length, `${id} dot count`).toBe(count);
      expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(
        buttons.map((_, i) => slideLabel(i + 1, count)),
      );
      // The pager belongs to the post, so it says which post it pages.
      expect(dots!.getAttribute("aria-label")).toBe(
        post.getAttribute("aria-label"),
      );
    }

    // A horizontal scroller inside the horizontal track swallows the swipe and
    // strands the reader mid-post — SqueezePlayTills and DiaryTeaser both used
    // to do it. Nothing on this page may.
    const tracks = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="reel-track"]'),
    );
    expect(tracks.length).toBe(CHAPTER_IDS.length);
    for (const track of tracks) {
      expect(
        track.querySelectorAll('[class*="overflow-x-auto"]').length,
        `${track.closest("section")?.id} nests a horizontal scroller`,
      ).toBe(0);
    }
  });

  it("gives the rail one dot per chapter, labelled and current-tracked", () => {
    renderLanding();
    const rail = screen.getByRole("navigation", {
      name: en.landing.reel.railLabel,
    });
    const dots = within(rail).getAllByRole("button");
    expect(dots.length).toBe(CHAPTER_IDS.length);
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual([
      en.landing.reel.promise,
      en.landing.reel.squeeze,
      en.landing.reel.freeInPerson,
      en.landing.reel.how,
      en.landing.reel.whatItCosts,
      en.landing.reel.trust,
      en.landing.reel.whatsComing,
      en.landing.reel.startFree,
    ]);
    // jsdom has no IntersectionObserver, so the reel degrades to a long page
    // and the first chapter is the current one.
    expect(dots[0].getAttribute("aria-current")).toBe("true");
  });

  it("keeps the product anchor the nav links (/#product)", () => {
    renderLanding();
    expect(chapter("product").id).toBe("product");
  });
});

describe("Landing — post 1, the promise", () => {
  it("leads by saying what Zolto is, in the merchant's nouns", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: new RegExp(
          `${MAKER_PITCH.headline}\\s+${MAKER_PITCH.headlineEmphasis}`,
          "i",
        ),
      }),
    ).toBeTruthy();
    // The hero has to name the category and the payment method before it
    // argues anything — this is the regression the whole reorder exists to
    // prevent, so assert the words, not just the heading.
    expect(screen.getByText(/point-of-sale and a web shop/i)).toBeTruthy();
  });

  it("keeps the promise and the video it rests on one slide", () => {
    renderLanding();
    const post = chapter("promise");
    // One slide, so the video is on screen with the claim rather than a swipe
    // behind it — and the post has no dots, since there is nothing to page.
    expect(post.querySelectorAll("[data-reel-panel]").length).toBe(1);
    const video = within(post).getByTestId("explainer-video");
    expect(video).toBeTruthy();
    expect(
      within(chapter("promise"))
        .getByTestId("explainer-video-el")
        .getAttribute("src"),
    ).toBe("/video/zolto-explainer.mp4");
    // Its caption is the one string this change adds to the locale files.
    expect(screen.getByText(en.landing.video.caption)).toBeTruthy();
  });

  it("offers the primary and secondary calls to action", () => {
    renderLanding();
    // Two signup CTAs (hero + closing chapter) both point at /signup.
    const signupLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/signup");
    expect(signupLinks.length).toBeGreaterThanOrEqual(2);
    // "See pricing" appears twice: beside the hero CTA, and on the pledge card,
    // where it is the way to the five itemised points that now live on /pricing.
    const pricingLinks = screen.getAllByRole("link", { name: /see pricing/i });
    expect(pricingLinks.length).toBe(2);
    for (const link of pricingLinks) {
      expect(link.getAttribute("href")).toBe("/pricing");
    }
  });

  it("shows where Zolto is from above the fold", () => {
    renderLanding();
    for (const badge of SOVEREIGNTY.heroBadges) {
      expect(within(chapter("promise")).getByText(badge)).toBeTruthy();
    }
  });
});

describe("Landing — post 2, the squeeze, and post 3, its answer", () => {
  it("argues the squeeze with the three tills, and nothing else", () => {
    renderLanding();
    const squeeze = within(chapter("squeeze"));
    // The band's own `data-testid` went away when it split into slide-sized
    // parts, so the check is the copy and the three rows of the comparison.
    // The homepage takes the short run-up and the matrix: the long body and
    // the spelled-out claim are what the grid is there to replace.
    expect(squeeze.getByText(POSITIONING.squeezePlay.bodyShort)).toBeTruthy();
    expect(squeeze.getAllByTestId(/^squeeze-row-/).length).toBe(3);
    expect(squeeze.queryByTestId("squeeze-claim")).toBeNull();
    // Only one row scores on both properties — the argument, drawn.
    expect(squeeze.getByTestId("squeeze-cell-both-grid").dataset.has).toBe(
      "true",
    );
    expect(squeeze.getByTestId("squeeze-cell-both-twint").dataset.has).toBe(
      "true",
    );
    // The answer is the *next* post's claim, not this one's — one post, one
    // claim, which is the whole reason these two are no longer one four-slide
    // post.
    expect(squeeze.queryByTestId("zero-cost-pos")).toBeNull();
  });

  it("answers it in a post of its own: the CHF 0 till and its price", () => {
    renderLanding();
    const free = within(chapter("free-in-person"));
    expect(free.getByTestId("zero-cost-pos")).toBeTruthy();
    expect(free.getByTestId("zero-cost-price").textContent).toContain("CHF");
    // …and the pricing pledge's promise still appears on the page.
    expect(
      screen.getAllByText(/selling in person is free/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("Landing — post 4, how it works", () => {
  it("opens on its own heading rather than giving it a screen", () => {
    // A slide carrying nothing but an eyebrow and an h2 costs a swipe and says
    // nothing the next slide doesn't, so the heading rides on the first slide.
    renderLanding();
    const slides = chapter("product").querySelectorAll("[data-reel-panel]");
    expect(slides.length).toBe(3);
    const first = within(slides[0] as HTMLElement);
    expect(first.getByText(en.landing.howEyebrow)).toBeTruthy();
    expect(
      first.getByRole("heading", { level: 2, name: en.landing.howHeading }),
    ).toBeTruthy();
    expect(
      first.getByRole("heading", { level: 3, name: en.landing.inventoryTitle }),
    ).toBeTruthy();
  });

  it("shows the product visually: channels, photo→listing, and the till", () => {
    renderLanding();
    const how = within(chapter("product"));
    expect(how.getByText("Market stall")).toBeTruthy();
    expect(how.getByText("Web storefront")).toBeTruthy();
    expect(how.getByText("Moonstone Pendant Necklace")).toBeTruthy();
    // The till came down from the hero rather than being dropped when the
    // explainer video took its place.
    expect(how.getByTestId("hero-till")).toBeTruthy();
  });

  it("shows the till on a phone, not just on a desktop", () => {
    renderLanding();
    // The hero visual used to be `hidden md:block`, which dropped the picture
    // of the product on the device most makers browse from. jsdom has no
    // viewport, so the check is that nothing in the till's ancestry inside the
    // chapter hides it at the base breakpoint.
    let el: HTMLElement | null = screen.getByTestId("hero-till");
    while (el && el.tagName !== "SECTION") {
      expect(el.className).not.toMatch(/(^|\s)hidden(\s|$)/);
      el = el.parentElement;
    }
  });
});

describe("Landing — post 5, what it costs, and post 6, trust", () => {
  it("puts the year-vs-month strip beside the pledge that backs it", () => {
    renderLanding();
    const costs = within(chapter("costs"));
    // A year with the old guard against a month here.
    expect(costs.getByText(en.shared.costComparison.themLabel)).toBeTruthy();
    expect(costs.getByText(en.shared.costComparison.usLabel)).toBeTruthy();
    // The pledge, signed — it is a promise about the number beside it, which is
    // why it moved off the Swissness post.
    expect(costs.getByText(en.landing.pledgeSignature)).toBeTruthy();
  });

  it("carries the whole ledger on the trust post", () => {
    renderLanding();
    const trust = within(chapter("trust"));
    // The ledger: every row, including the ones still outside Europe.
    expect(
      trust.getByRole("heading", {
        name: `${SOVEREIGNTY.headline} ${SOVEREIGNTY.headlineEmphasis}`,
      }),
    ).toBeTruthy();
    for (const entry of SOVEREIGNTY.ledger) {
      expect(trust.getByText(entry.piece)).toBeTruthy();
    }
    expect(
      trust.getByRole("link", { name: /moving next/i }).getAttribute("href"),
    ).toBe(SOVEREIGNTY.href);
  });

  it("keeps the two costs beside each other at every width", () => {
    // Stacked, the strip is 700px tall on a phone — the rotated arrow alone
    // claims a row the width of the card — and it is a *comparison*: putting
    // the two numbers a scroll apart is not one. jsdom has no viewport, so the
    // check is that the three columns are unconditional.
    renderLanding();
    const strip = chapter("costs").querySelector<HTMLElement>(
      "[class*='brand-ink-deep']",
    );
    expect(strip).toBeTruthy();
    expect(strip!.className).toContain("grid-cols-[1fr_auto_1fr]");
    expect(strip!.className).not.toContain("sm:grid-cols-");
    expect(strip!.innerHTML).not.toContain("rotate-90");
  });
});

describe("Landing — post 7, what's coming", () => {
  it("shows the scan → tap → reconcile selling loop", () => {
    renderLanding();
    const coming = within(chapter("whats-coming"));
    expect(
      coming.getByRole("heading", { name: /Photograph your stock list/i }),
    ).toBeTruthy();
    expect(
      coming.getByRole("heading", { name: /One email\. One tap\./i }),
    ).toBeTruthy();
  });

  it("keeps the AI-native thesis — the strongest of the three bands — with its chart", () => {
    renderLanding();
    const coming = within(chapter("whats-coming"));
    const thesis = coming.getByRole("heading", {
      level: 2,
      name: new RegExp(AI_NATIVE_PITCH.headline, "i"),
    });
    expect(thesis).toBeTruthy();
    expect(coming.getByTestId("ai-native-band")).toBeTruthy();
    // The caption became a label on the crossing — see DiscoveryShiftChart.
    expect(coming.getByText(AI_NATIVE_PITCH.chart.crossingLabel)).toBeTruthy();
    expect(coming.queryByText(AI_NATIVE_PITCH.chart.caption)).toBeNull();
  });

  it("links the two bands that moved to /why-zolto", () => {
    renderLanding();
    expect(
      within(chapter("whats-coming"))
        .getByRole("link", { name: en.landing.reel.whyZoltoLink })
        .getAttribute("href"),
    ).toBe("/why-zolto");
  });
});

describe("Landing — post 8, start free", () => {
  it("closes on the CTA and the diary a visitor can go and check", () => {
    renderLanding();
    const closing = within(chapter("start-free"));
    expect(
      closing.getByRole("heading", { name: en.landing.ctaHeading }),
    ).toBeTruthy();
    expect(
      closing
        .getByRole("link", { name: en.landing.ctaButton })
        .getAttribute("href"),
    ).toBe("/signup");
    expect(closing.getByTestId("diary-teaser")).toBeTruthy();
  });
});

describe("Landing — the copy that moved, and the copy that stayed", () => {
  it("still renders every landing locale key the homepage kept", () => {
    renderLanding();
    const text = document.body.textContent ?? "";
    for (const [key, value] of Object.entries(LANDING_STRINGS)) {
      if (key in MOVED_KEYS) continue;
      expect(text.includes(value), `landing.${key} is missing`).toBe(true);
    }
    // The rail's labels are accessible names rather than body copy.
    const rail = screen.getByRole("navigation", {
      name: en.landing.reel.railLabel,
    });
    for (const label of Object.values(en.landing.reel)) {
      if (label === en.landing.reel.railLabel) continue;
      if (label === en.landing.reel.whyZoltoLink) continue;
      // The slide label names a dot under a post, not a chapter on the rail.
      if (label === en.landing.reel.slide) continue;
      expect(
        within(rail).queryByRole("button", { name: label }),
        `rail dot "${label}"`,
      ).toBeTruthy();
    }
    expect(en.landing.video.play.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: en.landing.video.play }),
    ).toBeTruthy();
  });

  it("no longer carries the bands that moved to sub-pages", () => {
    renderLanding();
    const text = document.body.textContent ?? "";
    for (const [key, kind] of Object.entries(MOVED_KEYS)) {
      if (kind !== "distinctive") continue;
      const value = LANDING_STRINGS[key];
      expect(text.includes(value), `landing.${key} should have moved`).toBe(
        false,
      );
    }
    // The proof band's chat mock and the mechanics band are gone with them.
    expect(screen.queryByTestId("agent-chat-mock")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /How an AI buys from you/i }),
    ).toBeNull();
  });
});
