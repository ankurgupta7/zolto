import { describe, it, expect } from "vitest";
import {
  heroCopy,
  valueProps,
  genericFaq,
  genericAbout,
  genericTermsSections,
  genericImprint,
  pageChrome,
  contentFrom,
  toParagraphs,
  EMPTY_CONTENT,
  DEFAULT_HERO_IMAGE,
  type StorefrontContent,
} from "./storefrontContent";
import { KALAKOSH_BRANDING, NEUTRAL_BRANDING, brandingFrom } from "./branding";
import { SUPPORTED_LANGUAGES } from "./languages";

/** Authored content with only the named fields filled in. */
function authored(over: Partial<StorefrontContent>): StorefrontContent {
  return { ...EMPTY_CONTENT, ...over };
}

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

/* ────────────────────────────────────────────────────────────────────────────
 * Merchant-authored content. The contract every one of these guards: a store
 * that has written nothing renders exactly what it rendered before these
 * columns existed, and a store that has written something renders that instead
 * — never a blank page.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("contentFrom", () => {
  it("reads the authored columns off a settings row", () => {
    const content = contentFrom({
      heroImageUrl: "https://cdn.example/shopfront.jpg",
      heroHeadline: "Made by hand",
      heroSubtitle: "In the old town since 2018",
      aboutBody: "We opened with one kiln.",
      companyLegalName: "Aurora Atelier GmbH",
      companyAddress: "Musterstrasse 1\n8001 Basel",
      vatNumber: "CHE-123.456.789 MWST",
      companyRegistration: "CH-020.3.001.234-5",
    });
    expect(content.heroHeadline).toBe("Made by hand");
    expect(content.companyAddress).toBe("Musterstrasse 1\n8001 Basel");
  });

  it("collapses missing, null and whitespace-only values to null", () => {
    // All three mean the same thing — "not written" — and callers must only
    // ever have to check for null. A "   " headline that reached the hero
    // would render an invisible H1 in place of the store name.
    expect(contentFrom(null)).toEqual(EMPTY_CONTENT);
    expect(contentFrom({})).toEqual(EMPTY_CONTENT);
    expect(
      contentFrom({ heroHeadline: "   ", aboutBody: "\n\n", vatNumber: "" }),
    ).toEqual(EMPTY_CONTENT);
  });

  it("trims surrounding whitespace off what it keeps", () => {
    expect(contentFrom({ heroHeadline: "  Made by hand  " }).heroHeadline).toBe(
      "Made by hand",
    );
  });
});

describe("toParagraphs", () => {
  it("splits on blank lines", () => {
    expect(toParagraphs("First para.\n\nSecond para.")).toEqual([
      "First para.",
      "Second para.",
    ]);
  });

  it("treats a single newline as wrapping, not a new paragraph", () => {
    // A merchant typing into a textarea wraps mid-sentence; that is not
    // structure, and rendering it as two paragraphs would break their prose.
    expect(toParagraphs("One sentence\ncontinued here.")).toEqual([
      "One sentence continued here.",
    ]);
  });

  it("tolerates ragged spacing and drops empty paragraphs", () => {
    expect(toParagraphs("A.\n   \n\n  \nB.\n\n\n")).toEqual(["A.", "B."]);
  });
});

describe("heroCopy with authored content", () => {
  it("keeps the store name and template subtitle when nothing is written", () => {
    const hero = heroCopy(AURORA, "en", EMPTY_CONTENT);
    expect(hero.title).toBe("Aurora Atelier");
    expect(hero.subtitle).toBe(heroCopy(AURORA, "en").subtitle);
    expect(hero.imageUrl).toBe(DEFAULT_HERO_IMAGE);
  });

  it("uses the merchant's headline, subtitle and banner when written", () => {
    const hero = heroCopy(
      AURORA,
      "en",
      authored({
        heroHeadline: "Made by hand",
        heroSubtitle: "In the old town since 2018",
        heroImageUrl: "https://cdn.example/shopfront.jpg",
      }),
    );
    expect(hero.title).toBe("Made by hand");
    expect(hero.subtitle).toBe("In the old town since 2018");
    expect(hero.imageUrl).toBe("https://cdn.example/shopfront.jpg");
  });

  it("overrides each field independently", () => {
    // A store that writes only a headline still gets the translated template
    // sentence under it, rather than an empty line.
    const hero = heroCopy(AURORA, "de", authored({ heroHeadline: "Von Hand" }));
    expect(hero.title).toBe("Von Hand");
    expect(hero.subtitle).toBe(heroCopy(AURORA, "de").subtitle);
    expect(hero.badge).toBe("Willkommen");
  });

  it("shows authored copy as written in every language", () => {
    // Deliberate: a merchant writes one headline and it is shown to everyone.
    // Machine-translating a store's own words would be worse than not.
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(
        heroCopy(AURORA, lang, authored({ heroHeadline: "Made by hand" }))
          .title,
      ).toBe("Made by hand");
    }
  });
});

describe("genericAbout with an authored body", () => {
  it("falls back to the template when nothing is written", () => {
    const about = genericAbout(AURORA, "en", EMPTY_CONTENT);
    expect(about.authored).toBe(false);
    expect(about.paragraphs).toEqual(genericAbout(AURORA, "en").paragraphs);
  });

  it("renders the merchant's paragraphs under the translated heading", () => {
    const about = genericAbout(
      AURORA,
      "de",
      authored({ aboutBody: "Erster Absatz.\n\nZweiter Absatz." }),
    );
    expect(about.authored).toBe(true);
    expect(about.paragraphs).toEqual(["Erster Absatz.", "Zweiter Absatz."]);
    // The heading is chrome, not the merchant's voice — it stays translated.
    expect(about.title).toBe("Über Aurora Atelier");
  });

  it("keeps the template when the body has no real paragraphs left", () => {
    // The second guard behind contentFrom: a body that survives as whitespace
    // must not empty the page.
    const about = genericAbout(AURORA, "en", authored({ aboutBody: "\n \n" }));
    expect(about.authored).toBe(false);
    expect(about.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("genericImprint with company details", () => {
  it("names the registered entity over the trading name when given", () => {
    const imprint = genericImprint(
      AURORA,
      "en",
      authored({ companyLegalName: "Aurora Atelier GmbH" }),
    );
    expect(imprint.lines[0]).toContain("Aurora Atelier GmbH");
  });

  it("lists address, VAT and register number once entered", () => {
    const imprint = genericImprint(
      AURORA,
      "en",
      authored({
        companyAddress: "Musterstrasse 1\n8001 Basel",
        vatNumber: "CHE-123.456.789 MWST",
        companyRegistration: "CH-020.3.001.234-5",
      }),
    );
    const blob = imprint.lines.join("\n");
    expect(blob).toContain("Musterstrasse 1\n8001 Basel");
    expect(blob).toContain("CHE-123.456.789 MWST");
    expect(blob).toContain("CH-020.3.001.234-5");
  });

  it("omits every line the merchant has not filled in", () => {
    const imprint = genericImprint(AURORA, "en", EMPTY_CONTENT);
    const blob = imprint.lines.join("\n");
    expect(blob).not.toContain("VAT number");
    expect(blob).not.toContain("Address:");
    expect(blob).not.toContain("Commercial register");
  });

  // Drives whether the page still shows its "you need to add these" note.
  it("reports company details only once an address exists", () => {
    expect(genericImprint(AURORA, "en", EMPTY_CONTENT).hasCompanyDetails).toBe(
      false,
    );
    // A sole trader may have neither a VAT registration nor a register entry,
    // so those alone must not count as "done".
    expect(
      genericImprint(AURORA, "en", authored({ vatNumber: "CHE-1" }))
        .hasCompanyDetails,
    ).toBe(false);
    expect(
      genericImprint(AURORA, "en", authored({ companyAddress: "Street 1" }))
        .hasCompanyDetails,
    ).toBe(true);
  });

  it("labels the added lines in each language", () => {
    const full = authored({
      companyAddress: "Musterstrasse 1",
      vatNumber: "CHE-123",
      companyRegistration: "CH-020",
    });
    const rendered = SUPPORTED_LANGUAGES.map((lang) =>
      genericImprint(AURORA, lang, full).lines.join("\n"),
    );
    for (const blob of rendered) {
      expect(blob).toContain("Musterstrasse 1");
      expect(blob).toContain("CHE-123");
      expect(blob).toContain("CH-020");
    }
    // Four distinct translations, not the English one four times.
    expect(new Set(rendered).size).toBe(SUPPORTED_LANGUAGES.length);
  });
});

// Every generator keeps its old behaviour when called without content, which
// is what lets the storefront pages adopt this one at a time.
describe("authored content is optional everywhere", () => {
  it("defaults to no overrides", () => {
    expect(heroCopy(AURORA, "en")).toEqual(
      heroCopy(AURORA, "en", EMPTY_CONTENT),
    );
    expect(genericAbout(AURORA, "en")).toEqual(
      genericAbout(AURORA, "en", EMPTY_CONTENT),
    );
    expect(genericImprint(AURORA, "en")).toEqual(
      genericImprint(AURORA, "en", EMPTY_CONTENT),
    );
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
