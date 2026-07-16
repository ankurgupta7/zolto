import { describe, it, expect } from "vitest";
import {
  brandingFrom,
  whatsappHref,
  instagramHref,
  defaultsForSlug,
  KALAKOSH_BRANDING,
  NEUTRAL_BRANDING,
} from "./branding";

describe("defaultsForSlug", () => {
  it("returns Kalakosh defaults only for the kalakosh slug", () => {
    expect(defaultsForSlug("kalakosh")).toBe(KALAKOSH_BRANDING);
    expect(defaultsForSlug("aurora")).toBe(NEUTRAL_BRANDING);
    expect(defaultsForSlug(null)).toBe(NEUTRAL_BRANDING);
  });
});

describe("brandingFrom", () => {
  it("falls back to Kalakosh defaults for the kalakosh tenant", () => {
    const b = brandingFrom(null, null, defaultsForSlug("kalakosh"));
    expect(b.storeName).toBe("Kalakosh Zürich");
    expect(b.whatsappNumber).toBe("41791721714");
    expect(b.primaryColor).toBe("#2D2620");
  });

  it("does NOT leak Kalakosh contacts to other tenants", () => {
    const b = brandingFrom("Aurora Atelier", null, defaultsForSlug("aurora"));
    expect(b.storeName).toBe("Aurora Atelier");
    expect(b.whatsappNumber).toBeNull();
    expect(b.instagramHandle).toBeNull();
    expect(b.contactEmail).toBeNull();
    expect(b.logoUrl).toBeNull();
  });

  it("prefers whiteLabelName, then tenant name, then default", () => {
    expect(brandingFrom("Foo", { whiteLabelName: "Bar Store" }).storeName).toBe(
      "Bar Store",
    );
    expect(brandingFrom("Foo", null).storeName).toBe("Foo");
    expect(brandingFrom(null, {}).storeName).toBe(NEUTRAL_BRANDING.storeName);
  });

  it("derives a short name from the first word", () => {
    expect(brandingFrom("Aurora Atelier", null).shortName).toBe("Aurora");
  });

  it("honors a valid hex primaryColor but ignores the #000000 schema default", () => {
    expect(brandingFrom("X", { primaryColor: "#123456" }).primaryColor).toBe(
      "#123456",
    );
    expect(brandingFrom("X", { primaryColor: "#000000" }).primaryColor).toBe(
      NEUTRAL_BRANDING.primaryColor,
    );
    expect(
      brandingFrom("X", { primaryColor: "not-a-color" }).primaryColor,
    ).toBe(NEUTRAL_BRANDING.primaryColor);
  });

  it("uses a single tenant logo for both light and dark slots", () => {
    const b = brandingFrom("X", { logoUrl: "/logo.png" });
    expect(b.logoUrl).toBe("/logo.png");
    expect(b.logoUrlDark).toBe("/logo.png");
  });

  it("lets a tenant's own settings override defaults", () => {
    const b = brandingFrom("Aurora", {
      whatsappNumber: "49123",
      instagramHandle: "aurora",
    });
    expect(b.whatsappNumber).toBe("49123");
    expect(b.instagramHandle).toBe("aurora");
  });
});

describe("whatsappHref / instagramHref", () => {
  it("builds a wa.me link with an encoded greeting for Kalakosh", () => {
    const href = whatsappHref(
      brandingFrom(null, null, defaultsForSlug("kalakosh")),
    )!;
    expect(href).toContain("https://wa.me/41791721714?text=");
    expect(decodeURIComponent(href)).toContain("Kalakosh Zürich");
  });

  it("returns null when no whatsapp number is set (neutral tenant)", () => {
    expect(whatsappHref(brandingFrom("Aurora", null))).toBeNull();
  });

  it("builds an instagram profile url from the handle", () => {
    expect(
      instagramHref(brandingFrom(null, null, defaultsForSlug("kalakosh"))),
    ).toBe("https://www.instagram.com/kalakoshzurich");
    expect(instagramHref(brandingFrom("Aurora", null))).toBeNull();
  });
});
