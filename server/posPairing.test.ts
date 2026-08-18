import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked at the module boundary per CLAUDE.md — no real DB, no real vault.
const claimPosPairingToken = vi.fn();
const createPosPairingToken = vi.fn();
const getTenantById = vi.fn();
vi.mock("./db", () => ({
  claimPosPairingToken: (...a: unknown[]) => claimPosPairingToken(...a),
  createPosPairingToken: (...a: unknown[]) => createPosPairingToken(...a),
  getTenantById: (...a: unknown[]) => getTenantById(...a),
}));

const getTenantSecret = vi.fn();
const setTenantSecret = vi.fn();
const isTenantSecretsConfigured = vi.fn();
vi.mock("./tenantSecrets", () => ({
  getTenantSecret: (...a: unknown[]) => getTenantSecret(...a),
  setTenantSecret: (...a: unknown[]) => setTenantSecret(...a),
  isTenantSecretsConfigured: () => isTenantSecretsConfigured(),
}));

import {
  buildPairingDeepLink,
  buildPairingWebLink,
  canMintPairingToken,
  generatePairingToken,
  hashPairingToken,
  mintPairingToken,
  PAIRING_TTL_MS,
  redeemPairingToken,
  rememberPosApiKey,
  POS_SECRET_PROVIDER,
} from "./posPairing";

const KEY = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  isTenantSecretsConfigured.mockReturnValue(true);
  getTenantSecret.mockResolvedValue(KEY);
  getTenantById.mockResolvedValue({
    id: 7,
    name: "Bergblume",
    slug: "bergblume",
  });
  createPosPairingToken.mockResolvedValue(undefined);
  setTenantSecret.mockResolvedValue(undefined);
});

describe("pairing token primitives", () => {
  it("mints url-safe tokens with no repeats", () => {
    const tokens = new Set(Array.from({ length: 50 }, generatePairingToken));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes to stable 64-char hex, and differs per token", () => {
    const h = hashPairingToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPairingToken("abc")).toBe(h);
    expect(hashPairingToken("abd")).not.toBe(h);
  });

  it("builds a deep link the apps can parse", () => {
    expect(buildPairingDeepLink("https://bergblume.zolto.ch", "tok123")).toBe(
      "zolto://pair?t=tok123&url=https%3A%2F%2Fbergblume.zolto.ch",
    );
  });

  it("carries the server origin, since a fresh install knows no host", () => {
    // Without this the app has a token and nowhere to redeem it.
    const link = buildPairingDeepLink("https://bergblume.zolto.ch", "tok");
    const url = new URL(link);
    expect(url.searchParams.get("url")).toBe("https://bergblume.zolto.ch");
    expect(url.searchParams.get("t")).toBe("tok");
  });

  it("percent-encodes a token in both link forms", () => {
    // base64url never produces these, but the builder must not be the reason a
    // future token format silently truncates at a & or #.
    expect(buildPairingDeepLink("https://x.test", "a&b=c")).toContain(
      "t=a%26b%3Dc",
    );
    expect(buildPairingWebLink("https://x.test", "a#b")).toBe(
      "https://x.test/pos/pair?t=a%23b",
    );
  });

  it("does not double up the slash in either link form", () => {
    expect(buildPairingWebLink("https://x.test/", "t")).toBe(
      "https://x.test/pos/pair?t=t",
    );
    expect(buildPairingDeepLink("https://x.test/", "t")).toContain(
      "url=https%3A%2F%2Fx.test",
    );
  });
});

describe("rememberPosApiKey", () => {
  it("stores the key in the vault under the pos provider", async () => {
    await expect(rememberPosApiKey(7, KEY)).resolves.toBe(true);
    expect(setTenantSecret).toHaveBeenCalledWith(7, POS_SECRET_PROVIDER, KEY);
  });

  it("skips quietly when the deployment has no vault key", async () => {
    // A self-hoster without TENANT_SECRETS_KEY must still be able to rotate.
    isTenantSecretsConfigured.mockReturnValue(false);
    await expect(rememberPosApiKey(7, KEY)).resolves.toBe(false);
    expect(setTenantSecret).not.toHaveBeenCalled();
  });

  it("does not propagate a vault failure to the caller", async () => {
    // Rotation and signup must not fail because a convenience feature did.
    setTenantSecret.mockRejectedValue(new Error("vault down"));
    await expect(rememberPosApiKey(7, KEY)).resolves.toBe(false);
  });
});

describe("canMintPairingToken", () => {
  it("is true when a key is stored", async () => {
    await expect(canMintPairingToken(7)).resolves.toBe(true);
  });

  it("is false for a tenant whose key predates the vault write", async () => {
    getTenantSecret.mockResolvedValue(null);
    await expect(canMintPairingToken(7)).resolves.toBe(false);
  });

  it("is false when the vault is not configured", async () => {
    isTenantSecretsConfigured.mockReturnValue(false);
    await expect(canMintPairingToken(7)).resolves.toBe(false);
    expect(getTenantSecret).not.toHaveBeenCalled();
  });

  it("is false rather than throwing when decryption fails", async () => {
    getTenantSecret.mockRejectedValue(new Error("bad master key"));
    await expect(canMintPairingToken(7)).resolves.toBe(false);
  });
});

describe("mintPairingToken", () => {
  it("stores only the hash, never the token itself", async () => {
    const res = await mintPairingToken(7);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const row = createPosPairingToken.mock.calls[0][0];
    expect(row.tenantId).toBe(7);
    expect(row.token).toBe(hashPairingToken(res.token));
    expect(row.token).not.toBe(res.token);
  });

  it("expires the token about ten minutes out", async () => {
    const before = Date.now();
    const res = await mintPairingToken(7);
    if (!res.ok) throw new Error("expected a token");
    const delta = res.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(PAIRING_TTL_MS - 5_000);
    expect(delta).toBeLessThanOrEqual(PAIRING_TTL_MS + 5_000);
  });

  it("refuses with needsRotation when there is no recoverable key", async () => {
    getTenantSecret.mockResolvedValue(null);
    const res = await mintPairingToken(7);
    expect(res).toEqual({ ok: false, reason: "needsRotation" });
    expect(createPosPairingToken).not.toHaveBeenCalled();
  });
});

describe("redeemPairingToken", () => {
  it("returns the store's credentials for a good token", async () => {
    claimPosPairingToken.mockResolvedValue({ tenantId: 7 });
    await expect(redeemPairingToken("tok")).resolves.toEqual({
      apiKey: KEY,
      storeName: "Bergblume",
      storeSlug: "bergblume",
    });
  });

  it("looks the token up by hash, not by its plaintext", async () => {
    claimPosPairingToken.mockResolvedValue({ tenantId: 7 });
    await redeemPairingToken("tok");
    expect(claimPosPairingToken).toHaveBeenCalledWith(hashPairingToken("tok"));
  });

  it("tolerates surrounding whitespace from a copy-paste", async () => {
    claimPosPairingToken.mockResolvedValue({ tenantId: 7 });
    await redeemPairingToken("  tok\n");
    expect(claimPosPairingToken).toHaveBeenCalledWith(hashPairingToken("tok"));
  });

  it("returns null for an unknown, expired or already-spent token", async () => {
    // claimPosPairingToken collapses all three into "no row matched".
    claimPosPairingToken.mockResolvedValue(undefined);
    await expect(redeemPairingToken("tok")).resolves.toBeNull();
  });

  it("returns null for an empty token without touching the database", async () => {
    await expect(redeemPairingToken("   ")).resolves.toBeNull();
    expect(claimPosPairingToken).not.toHaveBeenCalled();
  });

  it("returns null — and leaves the token spent — if the key has vanished", async () => {
    // The token is consumed by the claim itself. A missing key must not make it
    // reusable, or a failure here becomes a retry oracle.
    claimPosPairingToken.mockResolvedValue({ tenantId: 7 });
    getTenantSecret.mockResolvedValue(null);
    await expect(redeemPairingToken("tok")).resolves.toBeNull();
    expect(claimPosPairingToken).toHaveBeenCalledTimes(1);
  });

  it("returns null when the tenant row is gone", async () => {
    claimPosPairingToken.mockResolvedValue({ tenantId: 7 });
    getTenantById.mockResolvedValue(undefined);
    await expect(redeemPairingToken("tok")).resolves.toBeNull();
  });

  it("reads the key for the tenant the token names, not a caller-supplied id", async () => {
    claimPosPairingToken.mockResolvedValue({ tenantId: 99 });
    await redeemPairingToken("tok");
    expect(getTenantSecret).toHaveBeenCalledWith(99, POS_SECRET_PROVIDER);
  });
});
