import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySessionJwt, sanitizeNextPath, sanitizeNextTarget } from "./oauth";

const SECRET = "test-jwt-secret-at-least-32-characters-long";
const OTHER_SECRET = "different-jwt-secret-also-32-characters-plus";

async function sign(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(key);
}

describe("verifySessionJwt", () => {
  it("returns null for a missing token", async () => {
    expect(await verifySessionJwt(undefined, SECRET)).toBeNull();
    expect(await verifySessionJwt(null, SECRET)).toBeNull();
    expect(await verifySessionJwt("", SECRET)).toBeNull();
  });

  it("returns the session payload for a valid token", async () => {
    const token = await sign(
      { openId: "google:123", appId: "google", name: "Jane" },
      SECRET,
    );
    const result = await verifySessionJwt(token, SECRET);
    expect(result).toEqual({
      openId: "google:123",
      appId: "google",
      name: "Jane",
    });
  });

  it("returns null when the token was signed with a different secret", async () => {
    const token = await sign(
      { openId: "google:123", appId: "google", name: "Jane" },
      OTHER_SECRET,
    );
    expect(await verifySessionJwt(token, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await sign(
      { openId: "google:123", appId: "google", name: "Jane" },
      SECRET,
      -10,
    );
    expect(await verifySessionJwt(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token string", async () => {
    expect(await verifySessionJwt("not-a-real-jwt", SECRET)).toBeNull();
  });

  it("returns null when required claims are missing or wrong type", async () => {
    const missingName = await sign(
      { openId: "google:123", appId: "google" },
      SECRET,
    );
    expect(await verifySessionJwt(missingName, SECRET)).toBeNull();

    const wrongType = await sign(
      { openId: 123, appId: "google", name: "Jane" },
      SECRET,
    );
    expect(await verifySessionJwt(wrongType, SECRET)).toBeNull();
  });
});

describe("sanitizeNextPath", () => {
  it("accepts a rooted same-origin path (with query)", () => {
    expect(sanitizeNextPath("/onboarding")).toBe("/onboarding");
    expect(sanitizeNextPath("/onboarding?store=aurora")).toBe(
      "/onboarding?store=aurora",
    );
  });

  it("rejects protocol-relative and absolute URLs (open-redirect guard)", () => {
    expect(sanitizeNextPath("//evil.example.com")).toBeNull();
    expect(sanitizeNextPath("/\\evil.example.com")).toBeNull();
    expect(sanitizeNextPath("https://evil.example.com")).toBeNull();
    expect(sanitizeNextPath("http://evil.example.com")).toBeNull();
  });

  it("rejects non-rooted paths and non-strings", () => {
    expect(sanitizeNextPath("onboarding")).toBeNull();
    expect(sanitizeNextPath("")).toBeNull();
    expect(sanitizeNextPath(undefined)).toBeNull();
    expect(sanitizeNextPath(null)).toBeNull();
    expect(sanitizeNextPath(42)).toBeNull();
    expect(sanitizeNextPath(["/a"])).toBeNull();
  });

  it("rejects control characters and whitespace (redirect smuggling)", () => {
    expect(sanitizeNextPath("/a\nb")).toBeNull();
    expect(sanitizeNextPath("/a b")).toBeNull();
    expect(sanitizeNextPath("/a\tb")).toBeNull();
    expect(sanitizeNextPath("/a\r\nSet-Cookie: x")).toBeNull();
  });

  it("rejects an over-long path", () => {
    expect(sanitizeNextPath(`/${"a".repeat(600)}`)).toBeNull();
  });
});

describe("sanitizeNextTarget", () => {
  it("accepts a relative path exactly like sanitizeNextPath, regardless of root domain", () => {
    expect(sanitizeNextTarget("/claim/x", "zolto.ch")).toBe("/claim/x");
    expect(sanitizeNextTarget("/claim/x", null)).toBe("/claim/x");
  });

  it("accepts an absolute https URL on the platform root domain", () => {
    expect(sanitizeNextTarget("https://zolto.ch/admin", "zolto.ch")).toBe(
      "https://zolto.ch/admin",
    );
  });

  it("accepts an absolute https URL on a tenant subdomain", () => {
    expect(
      sanitizeNextTarget("https://blah.zolto.ch/admin?x=1", "zolto.ch"),
    ).toBe("https://blah.zolto.ch/admin?x=1");
  });

  it("rejects an absolute URL when no root domain is configured", () => {
    expect(sanitizeNextTarget("https://blah.zolto.ch/admin", null)).toBeNull();
  });

  it("rejects an absolute URL on an unrelated host", () => {
    expect(
      sanitizeNextTarget("https://evil.example.com/", "zolto.ch"),
    ).toBeNull();
  });

  it("rejects a host that merely ends with the same characters (evilzolto.ch)", () => {
    expect(
      sanitizeNextTarget("https://evilzolto.ch/admin", "zolto.ch"),
    ).toBeNull();
  });

  it("rejects a non-https absolute URL", () => {
    expect(
      sanitizeNextTarget("http://blah.zolto.ch/admin", "zolto.ch"),
    ).toBeNull();
  });

  it("rejects control characters and over-long input", () => {
    expect(sanitizeNextTarget("https://zolto.ch/a\nb", "zolto.ch")).toBeNull();
    expect(
      sanitizeNextTarget(`https://zolto.ch/${"a".repeat(600)}`, "zolto.ch"),
    ).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(sanitizeNextTarget(undefined, "zolto.ch")).toBeNull();
    expect(sanitizeNextTarget(42, "zolto.ch")).toBeNull();
  });
});
