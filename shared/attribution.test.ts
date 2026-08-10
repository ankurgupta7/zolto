import { describe, expect, it } from "vitest";
import {
  ZOLTO_ATTRIBUTION,
  ZOLTO_URL,
  creditShown,
  mayHideZoltoAttribution,
  showsZoltoAttribution,
  zoltoAttributionHref,
  zoltoCreatorJsonLd,
  zoltoCreatorRef,
  zoltoCreditSentence,
  zoltoPoweredBy,
} from "./attribution";

describe("showsZoltoAttribution", () => {
  it("credits the platform on a plan without white-labelling, switch or not", () => {
    expect(showsZoltoAttribution({ plan: "free" })).toBe(true);
    // The one that matters: a Free store cannot opt out of the credit it is
    // paying with. The column can hold `true` (a lapsed Pro store's leftover),
    // and it must read as "no" without anyone backfilling the row.
    expect(showsZoltoAttribution({ plan: "free", hideZoltoBadge: true })).toBe(
      true,
    );
  });

  it("lets a white-label plan switch the credit off, but only explicitly", () => {
    expect(showsZoltoAttribution({ plan: "pro" })).toBe(true);
    expect(showsZoltoAttribution({ plan: "pro", hideZoltoBadge: false })).toBe(
      true,
    );
    expect(showsZoltoAttribution({ plan: "pro", hideZoltoBadge: true })).toBe(
      false,
    );
  });

  it("honours a comped Pro store like a paying one", () => {
    // The reason this reads entitlements rather than tenant.plan: a store the
    // operator put on Pro for nothing has bought the same white-labelling.
    expect(
      showsZoltoAttribution({
        plan: "free",
        compPlan: "pro",
        hideZoltoBadge: true,
      }),
    ).toBe(false);
    expect(mayHideZoltoAttribution({ plan: "free", compPlan: "pro" })).toBe(
      true,
    );
  });

  it("treats a retired or unknown plan id as Free", () => {
    // maker/studio/atelier are retired tiers; nonsense can arrive from a URL.
    for (const plan of ["atelier", "studio", "", "enterprise"]) {
      expect(showsZoltoAttribution({ plan, hideZoltoBadge: true }), plan).toBe(
        true,
      );
    }
  });

  it("creditShown agrees with the full derivation", () => {
    for (const plan of ["free", "pro"]) {
      for (const hide of [true, false, null, undefined]) {
        const facts = { plan, hideZoltoBadge: hide };
        expect(
          creditShown(mayHideZoltoAttribution(facts), hide),
          `${plan}/${hide}`,
        ).toBe(showsZoltoAttribution(facts));
      }
    }
  });
});

describe("the credit's content", () => {
  it("names exactly one domain, and it is the one Zolto answers on", () => {
    // shared/platformDomains.test.ts guards the marketing constants for the
    // same reason: a credit published on every storefront must not point
    // anywhere the platform doesn't serve.
    const texts = [
      ZOLTO_URL,
      ZOLTO_ATTRIBUTION.generator,
      zoltoAttributionHref(),
      zoltoCreditSentence("Bergblume Keramik"),
      zoltoPoweredBy().description,
      JSON.stringify(zoltoCreatorJsonLd()),
    ];
    for (const text of texts) {
      const domains = text.match(/\b[a-z0-9-]+\.[a-z]{2,}\b/gi) ?? [];
      expect(domains.length, text).toBeGreaterThan(0);
      for (const d of domains) expect(d.toLowerCase(), text).toBe("zolto.ch");
    }
  });

  it("tags the visible link so storefront referrals are measurable", () => {
    const href = zoltoAttributionHref("storefront-footer");
    expect(href.startsWith(`${ZOLTO_URL}/?`)).toBe(true);
    const params = new URL(href).searchParams;
    expect(params.get("utm_source")).toBe("storefront-footer");
    expect(params.get("utm_medium")).toBe("made-with-zolto");
  });

  it("keeps the machine-readable surfaces on the bare canonical URL", () => {
    // An agent resolving the entity, or a crawler deduplicating it, must not
    // get a UTM-tagged variant — only the visible anchor carries those.
    expect(zoltoCreatorJsonLd().url).toBe(`${ZOLTO_URL}/`);
    expect(zoltoPoweredBy().url).toBe(ZOLTO_URL);
    expect(JSON.stringify(zoltoCreatorJsonLd())).not.toContain("utm_");
    expect(zoltoCreditSentence("Bergblume")).not.toContain("utm_");
  });

  it("gives the creator node the same @id the marketing site mints", () => {
    // server/marketingSeo.ts builds `${base}/#organization` with base =
    // https://zolto.ch. Same string here means a consumer crawling both
    // surfaces resolves one Zolto, not two.
    expect(zoltoCreatorJsonLd()["@id"]).toBe("https://zolto.ch/#organization");
    expect(zoltoCreatorRef()).toEqual({
      "@id": zoltoCreatorJsonLd()["@id"],
    });
  });

  it("names the store in the prose credit so a quoted sentence stands alone", () => {
    const sentence = zoltoCreditSentence("Bergblume Keramik");
    expect(sentence).toContain("Bergblume Keramik");
    expect(sentence).toContain("Zolto");
    expect(sentence).toContain(ZOLTO_URL);
  });

  it("tells an agent that the platform is not the counterparty", () => {
    expect(zoltoPoweredBy().name).toBe("Zolto");
    expect(zoltoPoweredBy().description).toContain("built and hosted on Zolto");
  });
});
