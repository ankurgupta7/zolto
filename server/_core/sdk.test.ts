import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { COOKIE_NAME } from "../../shared/const";

const { verifySessionJwt, getUserByOpenId } = vi.hoisted(() => ({
  verifySessionJwt: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("./oauth", () => ({ verifySessionJwt }));
vi.mock("../db", () => ({ getUserByOpenId }));

import { sdk } from "./sdk";

function reqWith(cookie?: string) {
  return { headers: cookie ? { cookie } : {} } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "a-test-jwt-secret-that-is-long-enough";
});

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe("sdk.authenticateRequest", () => {
  it("returns the user for a valid session cookie", async () => {
    verifySessionJwt.mockResolvedValue({
      openId: "google:1",
      appId: "google",
      name: "A",
    });
    getUserByOpenId.mockResolvedValue({ id: 1, openId: "google:1" });

    const user = await sdk.authenticateRequest(reqWith(`${COOKIE_NAME}=tok`));
    expect(user).toMatchObject({ id: 1 });
    expect(verifySessionJwt).toHaveBeenCalledWith("tok", expect.any(String));
  });

  it("rejects when there is no valid session", async () => {
    verifySessionJwt.mockResolvedValue(null);
    await expect(sdk.authenticateRequest(reqWith())).rejects.toThrow(
      /Invalid session/,
    );
    expect(getUserByOpenId).not.toHaveBeenCalled();
  });

  it("rejects when the session's user no longer exists", async () => {
    verifySessionJwt.mockResolvedValue({
      openId: "google:x",
      appId: "google",
      name: "X",
    });
    getUserByOpenId.mockResolvedValue(undefined);
    await expect(
      sdk.authenticateRequest(reqWith(`${COOKIE_NAME}=tok`)),
    ).rejects.toThrow(/User not found/);
  });
});

describe("sdk.createSessionToken", () => {
  it("is unsupported under Google OAuth", async () => {
    await expect(sdk.createSessionToken("openid")).rejects.toThrow(
      /Google OAuth/,
    );
  });
});
