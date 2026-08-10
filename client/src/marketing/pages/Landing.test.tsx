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
 * The six chapters, in order, and how many panels each is made of. A panel is
 * one screen: on a phone you swipe through 21 of them, on a roomy desktop each
 * chapter's panels become its columns and you scroll through six screens. The
 * counts are asserted because a chapter that lost a panel would silently lose a
 * screenful of the homepage.
 */
const CHAPTERS = {
  promise: 2,
  squeeze: 4,
  product: 4,
  trust: 5,
  "whats-coming": 4,
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
  it("is six chapters, in order, each a named section with a heading", () => {
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
    // 21 screens on a phone; six chapters' worth of columns on a desktop.
    expect(document.querySelectorAll("[data-reel-panel]").length).toBe(21);
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
      en.landing.reel.how,
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

describe("Landing — chapter 1, the promise", () => {
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
    expect(screen.getByText(/point-of-sale and a web store/i)).toBeTruthy();
  });

  it("puts the explainer video in the hero's second column", () => {
    renderLanding();
    const video = within(chapter("promise")).getByTestId("explainer-video");
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

describe("Landing — chapter 2, the squeeze", () => {
  it("keeps both arguments — the three tills and the CHF 0 till — in one chapter", () => {
    renderLanding();
    const squeeze = within(chapter("squeeze"));
    // Two panels of squeeze argument, two of the CHF 0 answer — the band's own
    // `data-testid` went away when it split into panel-sized parts.
    expect(squeeze.getByText(POSITIONING.squeezePlay.body)).toBeTruthy();
    expect(squeeze.getAllByTestId(/^squeeze-panel-/).length).toBe(3);
    expect(squeeze.getByTestId("squeeze-claim").textContent).toContain(
      POSITIONING.squeezePlay.claim,
    );
    // The differentiator, and the price it is free at.
    expect(squeeze.getByTestId("zero-cost-pos")).toBeTruthy();
    expect(squeeze.getByTestId("zero-cost-price").textContent).toContain("CHF");
    // …and the pricing pledge's promise still appears on the page.
    expect(
      screen.getAllByText(/selling in person is free/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("Landing — chapter 3, how it works", () => {
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

describe("Landing — chapter 4, trust", () => {
  it("carries the cost strip, the pledge, and the whole ledger", () => {
    renderLanding();
    const trust = within(chapter("trust"));
    // A year with the old guard against a month here.
    expect(trust.getByText(en.shared.costComparison.themLabel)).toBeTruthy();
    expect(trust.getByText(en.shared.costComparison.usLabel)).toBeTruthy();
    // The pledge, signed.
    expect(trust.getByText(en.landing.pledgeSignature)).toBeTruthy();
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
});

describe("Landing — chapter 5, what's coming", () => {
  it("shows the scan → tap → reconcile selling loop", () => {
    renderLanding();
    const coming = within(chapter("whats-coming"));
    expect(
      coming.getByRole("heading", { name: /Scan your notebook/i }),
    ).toBeTruthy();
    expect(
      coming.getByRole("heading", { name: /Confirm at day.s end/i }),
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
    expect(coming.getByText(AI_NATIVE_PITCH.chart.caption)).toBeTruthy();
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

describe("Landing — chapter 6, start free", () => {
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
