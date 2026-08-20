import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import express from "express";
import request from "supertest";
import {
  SignJWT,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  type CryptoKey,
} from "jose";
import { COOKIE_NAME } from "../../shared/const";

const upsertUser = vi.fn();
vi.mock("../db", () => ({
  upsertUser: (...args: unknown[]) => upsertUser(...args),
}));

import { registerAppleOAuthRoutes } from "./appleAuth";

const ENV_KEYS = [
  "APPLE_CLIENT_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "ADMIN_EMAIL",
  "JWT_SECRET",
  "PUBLIC_BASE_URL",
] as const;
const originalEnv: Record<string, string | undefined> = {};

const CLIENT_ID = "ch.gwinn.web";
const APPLE_KID = "test-apple-kid";
const STATE = "a-fixed-test-state-value";

// Apple's own signing key (used to sign the fake id_token, verified against
// the mocked JWKS endpoint below) — distinct from APPLE_PRIVATE_KEY, which is
// OUR key for the client-secret JWT sent to Apple's token endpoint.
let applePrivateKey: CryptoKey;
let applePublicJwk: Record<string, unknown>;

beforeAll(async () => {
  const apple = await generateKeyPair("ES256", { extractable: true });
  applePrivateKey = apple.privateKey;
  applePublicJwk = {
    ...(await exportJWK(apple.publicKey)),
    kid: APPLE_KID,
    alg: "ES256",
    use: "sig",
  };

  const ours = await generateKeyPair("ES256", { extractable: true });
  process.env.APPLE_PRIVATE_KEY = await exportPKCS8(ours.privateKey);
});

function toHref(u: string | URL): string {
  return typeof u === "string" ? u : u.href;
}

function mockApple(opts: { idToken?: string | null; tokenOk?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const href = toHref(url);
      if (href.includes("appleid.apple.com/auth/token")) {
        const ok = opts.tokenOk ?? true;
        return {
          ok,
          status: ok ? 200 : 400,
          statusText: "Bad Request",
          json: async () => ({ access_token: "at", id_token: opts.idToken }),
          text: async () => "token error detail",
        };
      }
      if (href.includes("appleid.apple.com/auth/keys")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ keys: [applePublicJwk] }),
          text: async () => "",
        };
      }
      throw new Error(`unexpected fetch url in test: ${href}`);
    }),
  );
}

async function signFakeAppleIdToken(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: APPLE_KID })
    .setIssuer("https://appleid.apple.com")
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(applePrivateKey);
}

function makeApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true })); // Apple's form_post callback
  registerAppleOAuthRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) {
    if (!(key in originalEnv)) originalEnv[key] = process.env[key];
  }
  process.env.APPLE_CLIENT_ID = CLIENT_ID;
  process.env.APPLE_TEAM_ID = "TEAM123456";
  process.env.APPLE_KEY_ID = "KEY123456";
  // APPLE_PRIVATE_KEY set once in beforeAll — a real key, left in place.
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.JWT_SECRET = "a-test-jwt-secret-that-is-long-enough";
  delete process.env.PUBLIC_BASE_URL;
  upsertUser.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (key === "APPLE_PRIVATE_KEY") continue; // keep the real key across tests
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.restoreAllMocks();
});

describe("GET /api/oauth/apple/login", () => {
  it("redirects to Apple's consent screen with form_post + a CSRF state", async () => {
    const res = await request(makeApp())
      .get("/api/oauth/apple/login")
      .set("Host", "shop.example");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.hostname).toBe("appleid.apple.com");
    expect(loc.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("response_mode")).toBe("form_post");
    expect(loc.searchParams.get("scope")).toBe("name email");
    expect(loc.searchParams.get("redirect_uri")).toContain(
      "/api/oauth/apple/callback",
    );
    expect(loc.searchParams.get("state")).toBeTruthy();

    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain("apple_oauth_state=");
  });

  it("returns 500 when APPLE_CLIENT_ID is missing", async () => {
    delete process.env.APPLE_CLIENT_ID;
    const res = await request(makeApp()).get("/api/oauth/apple/login");
    expect(res.status).toBe(500);
    expect(res.text).toContain("not configured");
  });
});

describe("POST /api/oauth/apple/callback", () => {
  it("returns 400 when the CSRF state doesn't match the cookie", async () => {
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ code: "abc", state: "a-different-value" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when there's no state cookie at all", async () => {
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .send({ code: "abc", state: STATE });
    expect(res.status).toBe(400);
  });

  it("returns 400 when Apple reports an error", async () => {
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ error: "user_cancelled_authorize", state: STATE });
    expect(res.status).toBe(400);
    expect(res.text).toContain("user_cancelled_authorize");
  });

  it("returns 400 when the authorization code is missing", async () => {
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ state: STATE });
    expect(res.status).toBe(400);
  });

  it("returns 500 when the server config is incomplete", async () => {
    delete process.env.JWT_SECRET;
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ code: "abc", state: STATE });
    expect(res.status).toBe(500);
  });

  it("signs in the platform admin, using the first-time `user` name field, and lands on /admin", async () => {
    const idToken = await signFakeAppleIdToken({
      sub: "apple-sub-1",
      email: "Admin@Example.com",
      email_verified: "true",
    });
    mockApple({ idToken });

    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({
        code: "abc",
        state: STATE,
        user: JSON.stringify({ name: { firstName: "Ada", lastName: "Admin" } }),
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin");
    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "apple:apple-sub-1",
        email: "Admin@Example.com",
        name: "Ada Admin",
        loginMethod: "apple",
        role: "admin",
      }),
    );
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
  });

  it("signs in a regular user without a name field, falling back to their email", async () => {
    const idToken = await signFakeAppleIdToken({
      sub: "apple-sub-2",
      email: "someone@example.com",
      email_verified: "true",
    });
    mockApple({ idToken });

    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ code: "abc", state: STATE });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    const arg = upsertUser.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.role).toBeUndefined();
    expect(arg.name).toBe("someone@example.com");
  });

  it("redirects to a stashed safe next path when present", async () => {
    const idToken = await signFakeAppleIdToken({
      sub: "apple-sub-3",
      email: "someone@example.com",
    });
    mockApple({ idToken });

    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}; oauth_next=/claim/mystore`)
      .send({ code: "abc", state: STATE });

    expect(res.headers.location).toBe("/claim/mystore");
  });

  it("returns 500 when the token exchange fails", async () => {
    mockApple({ idToken: undefined, tokenOk: false });
    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ code: "abc", state: STATE });
    expect(res.status).toBe(500);
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("returns 500 when the id_token fails signature verification (wrong audience)", async () => {
    const idToken = await new SignJWT({ sub: "x", email: "x@example.com" })
      .setProtectedHeader({ alg: "ES256", kid: APPLE_KID })
      .setIssuer("https://appleid.apple.com")
      .setAudience("some-other-client-id") // not CLIENT_ID
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(applePrivateKey);
    mockApple({ idToken });

    const res = await request(makeApp())
      .post("/api/oauth/apple/callback")
      .type("form")
      .set("Cookie", `apple_oauth_state=${STATE}`)
      .send({ code: "abc", state: STATE });
    expect(res.status).toBe(500);
    expect(upsertUser).not.toHaveBeenCalled();
  });
});
