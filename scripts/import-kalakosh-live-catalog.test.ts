import { describe, expect, it, vi } from "vitest";

// The script's module body must not connect to anything just to be imported —
// main() is guarded on being the directly-invoked entry point, but these two
// pull in the whole server at import time.
vi.mock("../server/db", () => ({ getDb: vi.fn() }));
vi.mock("../server/importKalakosh", () => ({
  importKalakoshCatalog: vi.fn(),
}));

import { parseArgs, resolveEnvFilePath } from "./import-kalakosh-live-catalog";

describe("parseArgs", () => {
  it("takes the env file positionally, as the original invocation did", () => {
    expect(parseArgs(["path/to/.env"])).toMatchObject({
      envFilePath: "path/to/.env",
      dryRun: false,
    });
  });

  it("takes the env file as --env-file=path", () => {
    expect(parseArgs(["--env-file=path/to/.env"]).envFilePath).toBe(
      "path/to/.env",
    );
  });

  it("returns no env file when none is given", () => {
    expect(parseArgs([]).envFilePath).toBeUndefined();
    expect(parseArgs(["--dry-run"]).envFilePath).toBeUndefined();
  });

  it("parses the source, asset-base and tenant overrides", () => {
    expect(
      parseArgs([
        ".env",
        "--dry-run",
        "--source-db=mysql://u:p@old-host/kalakosh",
        "--source-url=https://kalakosh.ch/api/trpc/products.list",
        "--asset-base=https://kalakosh.ch",
        "--tenant=kalakosh",
      ]),
    ).toEqual({
      envFilePath: ".env",
      dryRun: true,
      sourceDatabaseUrl: "mysql://u:p@old-host/kalakosh",
      sourceUrl: "https://kalakosh.ch/api/trpc/products.list",
      assetBaseUrl: "https://kalakosh.ch",
      tenantSlug: "kalakosh",
    });
  });

  it("keeps a URL containing '=' intact", () => {
    expect(parseArgs(["--source-url=https://k.ch/api?a=1&b=2"]).sourceUrl).toBe(
      "https://k.ch/api?a=1&b=2",
    );
  });

  it("rejects an unknown flag instead of silently ignoring it", () => {
    expect(() => parseArgs(["--dry"])).toThrow(/Unknown option: --dry/);
  });

  it("keeps the first bare argument as the env file", () => {
    expect(parseArgs(["first.env", "second.env"]).envFilePath).toBe(
      "first.env",
    );
  });
});

describe("resolveEnvFilePath", () => {
  it("still resolves both accepted forms", () => {
    expect(resolveEnvFilePath(["a/.env"])).toBe("a/.env");
    expect(resolveEnvFilePath(["--env-file=b/.env"])).toBe("b/.env");
    expect(resolveEnvFilePath([])).toBeUndefined();
  });
});
