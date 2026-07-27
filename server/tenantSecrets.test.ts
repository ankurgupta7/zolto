import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isTenantSecretsConfigured,
} from "./tenantSecrets";
import { generatePosApiKey, hashPosApiKey } from "./posApiKey";

const TEST_KEY = "a".repeat(64); // 32 bytes of 0xaa — valid 64-hex master key

describe("tenant secret crypto", () => {
  it("round-trips a secret through AES-256-GCM", () => {
    const secret = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
    const payload = encryptSecret(secret, TEST_KEY);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload, TEST_KEY)).toBe(secret);
  });

  it("produces a fresh IV per encryption (no deterministic ciphertext)", () => {
    const a = encryptSecret("same-value", TEST_KEY);
    const b = encryptSecret("same-value", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("rejects a wrong master key (auth tag verification)", () => {
    const payload = encryptSecret("secret", TEST_KEY);
    expect(() => decryptSecret(payload, "b".repeat(64))).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const payload = encryptSecret("secret", TEST_KEY);
    const parts = payload.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("00") ? "ff" : "00");
    expect(() => decryptSecret(parts.join(":"), TEST_KEY)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-payload", TEST_KEY)).toThrow();
    expect(() => decryptSecret("v0:aa:bb:cc", TEST_KEY)).toThrow();
  });
});

describe("TENANT_SECRETS_KEY handling", () => {
  const ORIGINAL = process.env.TENANT_SECRETS_KEY;
  beforeEach(() => {
    delete process.env.TENANT_SECRETS_KEY;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.TENANT_SECRETS_KEY;
    else process.env.TENANT_SECRETS_KEY = ORIGINAL;
  });

  it("encrypt throws with a clear message when the master key is unset", () => {
    expect(() => encryptSecret("x")).toThrow(/TENANT_SECRETS_KEY/);
  });

  it("encrypt throws when the master key is not 64 hex chars", () => {
    process.env.TENANT_SECRETS_KEY = "too-short";
    expect(() => encryptSecret("x")).toThrow(/TENANT_SECRETS_KEY/);
  });

  it("isTenantSecretsConfigured reflects the env var", () => {
    expect(isTenantSecretsConfigured()).toBe(false);
    process.env.TENANT_SECRETS_KEY = TEST_KEY;
    expect(isTenantSecretsConfigured()).toBe(true);
  });
});

describe("POS API key hashing", () => {
  it("generatePosApiKey returns 64 hex chars (256 bits)", () => {
    const key = generatePosApiKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashPosApiKey is deterministic and matches the stored form", () => {
    const key = generatePosApiKey();
    expect(hashPosApiKey(key)).toBe(hashPosApiKey(key));
    expect(hashPosApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPosApiKey(key)).not.toBe(key);
  });

  it("different keys hash differently", () => {
    expect(hashPosApiKey(generatePosApiKey())).not.toBe(
      hashPosApiKey(generatePosApiKey()),
    );
  });
});
