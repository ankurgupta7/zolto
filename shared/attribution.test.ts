import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import {
  PLATFORM_CREDIT,
  creditShown,
  mayHidePlatformCredit,
  showsPlatformCredit,
  platformCreditHref,
  platformCreatorJsonLd,
  platformCreatorRef,
  platformCreditSentence,
  platformPoweredBy,
} from "./attribution";

describe("showsPlatformCredit", () => {
  it("credits the platform on a plan without white-labelling, switch or not", () => {
    expect(showsPlatformCredit({ plan: "free" })).toBe(true);
    // The one that matters: a Free store cannot opt out of the credit it is
    // paying with. The column can hold `true` (a lapsed Pro store's leftover),
    // and it must read as "no" without anyone backfilling the row.
    expect(showsPlatformCredit({ plan: "free", hidePlatformCredit: true })).toBe(
      true,
    );
  });

  it("lets a white-label plan switch the credit off, but only explicitly", () => {
    expect(showsPlatformCredit({ plan: "pro" })).toBe(true);
    expect(showsPlatformCredit({ plan: "pro", hidePlatformCredit: false })).toBe(
      true,
    );
    expect(showsPlatformCredit({ plan: "pro", hidePlatformCredit: true })).toBe(
      false,
    );
  });

  it("honours a comped Pro store like a paying one", () => {
    // The reason this reads entitlements rather than tenant.plan: a store the
    // operator put on Pro for nothing has bought the same white-labelling.
    expect(
      showsPlatformCredit({
        plan: "free",
        compPlan: "pro",
        hidePlatformCredit: true,
      }),
    ).toBe(false);
    expect(mayHidePlatformCredit({ plan: "free", compPlan: "pro" })).toBe(
      true,
    );
  });

  it("treats a retired or unknown plan id as Free", () => {
    // maker/studio/atelier are retired tiers; nonsense can arrive from a URL.
    for (const plan of ["atelier", "studio", "", "enterprise"]) {
      expect(showsPlatformCredit({ plan, hidePlatformCredit: true }), plan).toBe(
        true,
      );
    }
  });

  it("creditShown agrees with the full derivation", () => {
    for (const plan of ["free", "pro"]) {
      for (const hide of [true, false, null, undefined]) {
        const facts = { plan, hidePlatformCredit: hide };
        expect(
          creditShown(mayHidePlatformCredit(facts), hide),
          `${plan}/${hide}`,
        ).toBe(showsPlatformCredit(facts));
      }
    }
  });
});

describe("the credit's content", () => {
  it(`names exactly one domain, and it is the one ${BRAND.name} answers on`, () => {
    // shared/platformDomains.test.ts guards the marketing constants for the
    // same reason: a credit published on every storefront must not point
    // anywhere the platform doesn't serve.
    const texts = [
      BRAND.url,
      PLATFORM_CREDIT.generator,
      platformCreditHref(),
      platformCreditSentence("Bergblume Keramik"),
      platformPoweredBy().description,
      JSON.stringify(platformCreatorJsonLd()),
    ];
    for (const text of texts) {
      const domains = text.match(/\b[a-z0-9-]+\.[a-z]{2,}\b/gi) ?? [];
      expect(domains.length, text).toBeGreaterThan(0);
      for (const d of domains) expect(d.toLowerCase(), text).toBe(BRAND.domain);
    }
  });

  it("tags the visible link so storefront referrals are measurable", () => {
    const href = platformCreditHref("storefront-footer");
    expect(href.startsWith(`${BRAND.url}/?`)).toBe(true);
    const params = new URL(href).searchParams;
    expect(params.get("utm_source")).toBe("storefront-footer");
    expect(params.get("utm_medium")).toBe("made-with-gwinn");
  });

  it("keeps the machine-readable surfaces on the bare canonical URL", () => {
    // An agent resolving the entity, or a crawler deduplicating it, must not
    // get a UTM-tagged variant — only the visible anchor carries those.
    expect(platformCreatorJsonLd().url).toBe(`${BRAND.url}/`);
    expect(platformPoweredBy().url).toBe(BRAND.url);
    expect(JSON.stringify(platformCreatorJsonLd())).not.toContain("utm_");
    expect(platformCreditSentence("Bergblume")).not.toContain("utm_");
  });

  it("gives the creator node the same @id the marketing site mints", () => {
    // server/marketingSeo.ts builds `${base}/#organization` with base =
    // https://gwinn.ch. Same string here means a consumer crawling both
    // surfaces resolves one Gwinn, not two.
    expect(platformCreatorJsonLd()["@id"]).toBe(`${BRAND.url}/#organization`);
    expect(platformCreatorRef()).toEqual({
      "@id": platformCreatorJsonLd()["@id"],
    });
  });

  it("names the store in the prose credit so a quoted sentence stands alone", () => {
    const sentence = platformCreditSentence("Bergblume Keramik");
    expect(sentence).toContain("Bergblume Keramik");
    expect(sentence).toContain(BRAND.name);
    expect(sentence).toContain(BRAND.url);
  });

  it("tells an agent that the platform is not the counterparty", () => {
    expect(platformPoweredBy().name).toBe(BRAND.name);
    expect(platformPoweredBy().description).toContain(`built and hosted on ${BRAND.name}`);
  });
});
