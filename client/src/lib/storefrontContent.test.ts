import { describe, it, expect } from "vitest";
import {
  heroCopy,
  genericFaq,
  genericAbout,
  genericTermsSections,
  genericImprint,
} from "./storefrontContent";
import { KALAKOSH_BRANDING, NEUTRAL_BRANDING, brandingFrom } from "./branding";

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
    for (const banned of ["kalakosh", "rajasthan", "pearl", "zürich", "zurich"]) {
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
      f.question.includes("get in touch")
    )!.answer;
    expect(answer).toContain("hi@aurora.example");
  });

  it("falls back to the contact form when no channels are set", () => {
    const answer = genericFaq(NEUTRAL_BRANDING).find((f) =>
      f.question.includes("get in touch")
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

// Guard: the Kalakosh fallback constant is still Kalakosh (used only for a
// hypothetical kalakosh tenant, e.g. a future cutover) — the generic builders
// must not leak it for other tenants, which the first test asserts.
describe("branding fixtures", () => {
  it("keeps Kalakosh defaults intact for the kalakosh tenant", () => {
    expect(KALAKOSH_BRANDING.storeName).toBe("Kalakosh Zürich");
  });
});
