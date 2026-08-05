import { describe, it, expect } from "vitest";
import {
  heroCopy,
  valueProps,
  genericFaq,
  genericAbout,
  genericTermsSections,
  genericImprint,
  pageChrome,
} from "./storefrontContent";
import { KALAKOSH_BRANDING, NEUTRAL_BRANDING, brandingFrom } from "./branding";
import { SUPPORTED_LANGUAGES } from "./languages";

const AURORA = brandingFrom("Aurora Atelier", {
  currency: "eur",
  contactEmail: "hi@aurora.example",
});

describe("storefront content is generic (no borrowed brand specifics)", () => {
  it("never contains Kalakosh/jewelry specifics for a generic tenant", () => {
    const blob = JSON.stringify([
      heroCopy(AURORA),
      genericFaq(AURORA),
      genericAbout(AURORA),
      genericTermsSections(AURORA),
      genericImprint(AURORA),
    ]).toLowerCase();
    for (const banned of [
      "kalakosh",
      "rajasthan",
      "pearl",
      "zürich",
      "zurich",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("parameterizes copy with the tenant's own name and currency", () => {
    expect(heroCopy(AURORA).title).toBe("Aurora Atelier");
    expect(genericAbout(AURORA).title).toBe("About Aurora Atelier");
    expect(JSON.stringify(genericFaq(AURORA))).toContain("EUR");
    expect(JSON.stringify(genericTermsSections(AURORA))).toContain("EUR");
  });
});

describe("genericFaq", () => {
  it("mentions the configured contact channels when present", () => {
    const answer = genericFaq(AURORA).find((f) =>
      f.question.includes("get in touch"),
    )!.answer;
    expect(answer).toContain("hi@aurora.example");
  });

  it("falls back to the contact form when no channels are set", () => {
    const answer = genericFaq(NEUTRAL_BRANDING).find((f) =>
      f.question.includes("get in touch"),
    )!.answer;
    expect(answer).toContain("contact form");
    expect(answer).not.toContain("Instagram");
  });

  it("always covers payment, shipping, returns, prices, and contact", () => {
    expect(genericFaq(AURORA).length).toBeGreaterThanOrEqual(5);
  });
});

describe("genericImprint", () => {
  it("names the operating store and includes email when set", () => {
    const imprint = genericImprint(AURORA);
    expect(imprint.lines.join(" ")).toContain("Aurora Atelier");
    expect(imprint.lines.join(" ")).toContain("hi@aurora.example");
  });

  it("omits the email line when the tenant has none", () => {
    const imprint = genericImprint(brandingFrom("Bare Store", {}));
    expect(imprint.lines.some((l) => l.includes("Email:"))).toBe(false);
  });
});

describe("language-aware generators", () => {
  it.each(SUPPORTED_LANGUAGES)("returns complete structures in %s", (lang) => {
    const hero = heroCopy(AURORA, lang);
    expect(hero.badge).toBeTruthy();
    expect(hero.title).toBe("Aurora Atelier");
    expect(hero.subtitle).toBeTruthy();

    const props = valueProps(lang);
    expect(props).toHaveLength(3);
    for (const p of props) {
      expect(p.title).toBeTruthy();
      expect(p.desc).toBeTruthy();
      expect(p.icon).toBeTruthy();
    }

    const faq = genericFaq(AURORA, lang);
    expect(faq).toHaveLength(5);
    for (const item of faq) {
      expect(item.question).toBeTruthy();
      expect(item.answer).toBeTruthy();
    }
    // Interpolated branding values survive translation.
    expect(JSON.stringify(faq)).toContain("EUR");
    expect(JSON.stringify(faq)).toContain("Aurora Atelier");
    expect(JSON.stringify(faq)).toContain("hi@aurora.example");

    const about = genericAbout(AURORA, lang);
    expect(about.title).toContain("Aurora Atelier");
    expect(about.paragraphs).toHaveLength(2);
    expect(about.paragraphs[0]).toContain("Aurora Atelier");

    const terms = genericTermsSections(AURORA, lang);
    expect(terms).toHaveLength(5);
    for (const section of terms) {
      expect(section.heading).toBeTruthy();
      expect(section.body.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(terms)).toContain("EUR");
    expect(terms[4].body[0]).toContain("hi@aurora.example");

    const imprint = genericImprint(AURORA, lang);
    expect(imprint.title).toBeTruthy();
    expect(imprint.lines.join(" ")).toContain("Aurora Atelier");
    expect(imprint.lines.join(" ")).toContain("hi@aurora.example");

    const chrome = pageChrome(AURORA, lang);
    expect(chrome.home.exploreShop).toBeTruthy();
    expect(chrome.home.scroll).toBeTruthy();
    expect(chrome.home.shopByCategory).toBeTruthy();
    expect(chrome.home.latestArrivals).toBeTruthy();
    expect(chrome.home.newInShop).toBeTruthy();
    expect(chrome.home.viewAll).toBeTruthy();
    expect(chrome.about.browseShop).toBeTruthy();
    expect(chrome.about.getInTouch).toBeTruthy();
    expect(chrome.faq.eyebrow).toBeTruthy();
    expect(chrome.faq.title).toBeTruthy();
    expect(chrome.faq.subtitle).toContain("Aurora Atelier");
    expect(chrome.faq.stillQuestions).toBeTruthy();
    expect(chrome.faq.reachOut).toBeTruthy();
    expect(chrome.faq.contactForm).toBeTruthy();
    expect(chrome.terms.title).toBeTruthy();
    expect(chrome.terms.intro).toContain("Aurora Atelier");
    expect(chrome.terms.disclaimer).toContain("Aurora Atelier");
    expect(chrome.imprint.disclaimer).toContain("Aurora Atelier");
  });

  it("defaults to English when no language is passed", () => {
    expect(heroCopy(AURORA)).toEqual(heroCopy(AURORA, "en"));
    expect(genericFaq(AURORA)).toEqual(genericFaq(AURORA, "en"));
    expect(genericAbout(AURORA)).toEqual(genericAbout(AURORA, "en"));
    expect(genericTermsSections(AURORA)).toEqual(
      genericTermsSections(AURORA, "en"),
    );
    expect(genericImprint(AURORA)).toEqual(genericImprint(AURORA, "en"));
  });

  it("translates German with formal Sie and Swiss orthography", () => {
    expect(heroCopy(AURORA, "de").subtitle).not.toBe(
      heroCopy(AURORA, "en").subtitle,
    );
    expect(heroCopy(AURORA, "de").badge).toBe("Willkommen");
    expect(genericAbout(AURORA, "de").title).toBe("Über Aurora Atelier");
    expect(genericImprint(AURORA, "de").title).toBe("Impressum");

    const blob = JSON.stringify([
      heroCopy(AURORA, "de"),
      valueProps("de"),
      genericFaq(AURORA, "de"),
      genericAbout(AURORA, "de"),
      genericTermsSections(AURORA, "de"),
      genericImprint(AURORA, "de"),
      pageChrome(AURORA, "de"),
    ]);
    // Formal address, never the informal "du".
    expect(blob).toContain("Sie");
    expect(blob).not.toMatch(/\bdu\b/i);
    // Swiss orthography: "ss", never "ß".
    expect(blob).not.toContain("ß");
    expect(blob).toContain("abschliessen");
  });

  it("translates French with vous", () => {
    expect(heroCopy(AURORA, "fr").badge).toBe("Bienvenue");
    expect(genericAbout(AURORA, "fr").title).toBe("À propos de Aurora Atelier");
    expect(genericImprint(AURORA, "fr").title).toBe("Mentions légales");
    const blob = JSON.stringify([
      heroCopy(AURORA, "fr"),
      genericFaq(AURORA, "fr"),
      genericTermsSections(AURORA, "fr"),
      pageChrome(AURORA, "fr"),
    ]);
    expect(blob).toContain("vous");
    expect(blob).not.toBe(
      JSON.stringify([
        heroCopy(AURORA, "en"),
        genericFaq(AURORA, "en"),
        genericTermsSections(AURORA, "en"),
        pageChrome(AURORA, "en"),
      ]),
    );
  });

  it("translates Italian with formal Lei", () => {
    expect(heroCopy(AURORA, "it").badge).toBe("Benvenuti");
    expect(genericImprint(AURORA, "it").title).toBe("Note legali");
    const blob = JSON.stringify([
      heroCopy(AURORA, "it"),
      genericFaq(AURORA, "it"),
      genericAbout(AURORA, "it"),
      genericTermsSections(AURORA, "it"),
      pageChrome(AURORA, "it"),
    ]);
    expect(blob).toContain("Lei");
    expect(blob).toContain("contatti");
    expect(blob).not.toBe(
      JSON.stringify([
        heroCopy(AURORA, "en"),
        genericFaq(AURORA, "en"),
        genericAbout(AURORA, "en"),
        genericTermsSections(AURORA, "en"),
        pageChrome(AURORA, "en"),
      ]),
    );
  });

  it("stays generic in every language (no borrowed brand specifics)", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const blob = JSON.stringify([
        heroCopy(AURORA, lang),
        genericFaq(AURORA, lang),
        genericAbout(AURORA, lang),
        genericTermsSections(AURORA, lang),
        genericImprint(AURORA, lang),
        pageChrome(AURORA, lang),
      ]).toLowerCase();
      for (const banned of ["kalakosh", "rajasthan", "zürich", "zurich"]) {
        expect(blob).not.toContain(banned);
      }
    }
  });

  it("keeps the FAQ contact-channel logic working in every language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const withChannels = genericFaq(AURORA, lang);
      expect(withChannels[4].answer).toContain("hi@aurora.example");
      const bare = genericFaq(NEUTRAL_BRANDING, lang);
      expect(bare[4].answer).not.toContain("Instagram");
      expect(bare[4].answer).not.toBe(withChannels[4].answer);
    }
  });
});

// Guard: the Kalakosh fallback constant is still Kalakosh (used only for a
// hypothetical kalakosh tenant, e.g. a future cutover) — the generic builders
// must not leak it for other tenants, which the first test asserts.
describe("branding fixtures", () => {
  it("keeps Kalakosh defaults intact for the kalakosh tenant", () => {
    expect(KALAKOSH_BRANDING.storeName).toBe("Kalakosh Zürich");
  });
});
