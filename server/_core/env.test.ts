import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts validates process.env at module load, so each case resets the module
// registry and re-imports with a fresh environment.
const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("ENV validation", () => {
  it("defaults missing vars to empty strings outside production", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    const { ENV } = await import("./env");
    expect(ENV.cookieSecret).toBe("");
    expect(ENV.databaseUrl).toBe("");
    expect(ENV.isProduction).toBe(false);
  });

  it("throws in production when a required secret is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    process.env.DATABASE_URL = "mysql://u:p@h/db";
    vi.resetModules();

    await expect(import("./env")).rejects.toThrow(/JWT_SECRET/);
  });

  it("lists every missing required secret in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    vi.resetModules();

    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });

  it("loads successfully in production when required secrets are present", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "super-secret";
    process.env.DATABASE_URL = "mysql://u:p@h/db";
    process.env.OWNER_OPEN_ID = "google:owner";
    vi.resetModules();

    const { ENV } = await import("./env");
    expect(ENV.cookieSecret).toBe("super-secret");
    expect(ENV.isProduction).toBe(true);
    expect(ENV.ownerOpenId).toBe("google:owner");
  });
});
