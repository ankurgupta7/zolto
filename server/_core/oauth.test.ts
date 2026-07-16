import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifySessionJwt } from "./oauth";

const SECRET = "test-jwt-secret-at-least-32-characters-long";
const OTHER_SECRET = "different-jwt-secret-also-32-characters-plus";

async function sign(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds = 3600
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
      SECRET
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
      OTHER_SECRET
    );
    expect(await verifySessionJwt(token, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await sign(
      { openId: "google:123", appId: "google", name: "Jane" },
      SECRET,
      -10
    );
    expect(await verifySessionJwt(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token string", async () => {
    expect(await verifySessionJwt("not-a-real-jwt", SECRET)).toBeNull();
  });

  it("returns null when required claims are missing or wrong type", async () => {
    const missingName = await sign(
      { openId: "google:123", appId: "google" },
      SECRET
    );
    expect(await verifySessionJwt(missingName, SECRET)).toBeNull();

    const wrongType = await sign(
      { openId: 123, appId: "google", name: "Jane" },
      SECRET
    );
    expect(await verifySessionJwt(wrongType, SECRET)).toBeNull();
  });
});
