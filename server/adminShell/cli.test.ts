import { BRAND } from "@shared/brand";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import { parseArgs, resolveOperator } from "./cli";
import { createFakeIo } from "./fakeIo";

const owner = {
  id: 1,
  email: `owner@${BRAND.domain}`,
  name: "Owner",
  role: "superadmin",
  lastSignedIn: new Date("2026-03-01T00:00:00Z"),
} as unknown as User;

const second = {
  ...owner,
  id: 2,
  email: `second@${BRAND.domain}`,
  name: "Second",
} as User;

const originalAdminEmail = process.env.ADMIN_EMAIL;
afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalAdminEmail;
  vi.unstubAllEnvs();
});

describe("parseArgs", () => {
  it("defaults to an interactive read-write session", () => {
    expect(parseArgs([])).toEqual({
      readOnly: false,
      store: null,
      as: null,
      help: false,
    });
  });

  it("understands the long and short read-only flags", () => {
    expect(parseArgs(["--read-only"]).readOnly).toBe(true);
    expect(parseArgs(["-r"]).readOnly).toBe(true);
  });

  it("takes a store as a separate argument or with an equals sign", () => {
    expect(parseArgs(["--store", "kalakosh"]).store).toBe("kalakosh");
    expect(parseArgs(["--store=kalakosh"]).store).toBe("kalakosh");
    expect(parseArgs(["-s", "kalakosh"]).store).toBe("kalakosh");
  });

  it("takes the operator to act as", () => {
    expect(parseArgs(["--as", `owner@${BRAND.domain}`]).as).toBe(
      `owner@${BRAND.domain}`,
    );
    expect(parseArgs([`--as=owner@${BRAND.domain}`]).as).toBe(
      `owner@${BRAND.domain}`,
    );
  });

  it("combines flags", () => {
    expect(
      parseArgs(["-r", "--store=kalakosh", `--as=owner@${BRAND.domain}`]),
    ).toEqual({
      readOnly: true,
      store: "kalakosh",
      as: `owner@${BRAND.domain}`,
      help: false,
    });
  });

  it("ignores anything it does not recognise rather than refusing to start", () => {
    expect(parseArgs(["--nonsense"]).help).toBe(false);
  });
});

describe("resolveOperator", () => {
  it("refuses to run with no platform owner, and says how to grant one", async () => {
    const fake = createFakeIo([]);
    expect(await resolveOperator(fake.io, [], null)).toBeNull();
    expect(fake.text()).toContain("deploy/tenant-admin.sh --superadmin");
  });

  it("uses the only owner without asking", async () => {
    const fake = createFakeIo([]);
    expect(await resolveOperator(fake.io, [owner], null)).toBe(owner);
  });

  it("honours --as when it names a real owner", async () => {
    const fake = createFakeIo([]);
    expect(
      await resolveOperator(fake.io, [owner, second], `second@${BRAND.domain}`),
    ).toBe(second);
  });

  it("matches --as case-insensitively", async () => {
    const fake = createFakeIo([]);
    expect(
      await resolveOperator(fake.io, [owner, second], "SECOND@GWINN.CH"),
    ).toBe(second);
  });

  it("says so and falls back to asking when --as names nobody", async () => {
    const fake = createFakeIo(["1"]);
    expect(
      await resolveOperator(fake.io, [owner, second], `nope@${BRAND.domain}`),
    ).toBe(owner);
    expect(fake.text()).toContain("is not a platform owner here");
  });

  it("prefers ADMIN_EMAIL when several owners exist, rather than asking every time", async () => {
    vi.stubEnv("ADMIN_EMAIL", `second@${BRAND.domain}`);
    const fake = createFakeIo([]);
    expect(await resolveOperator(fake.io, [owner, second], null)).toBe(second);
  });

  it("asks which owner to act as when there is more than one", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const fake = createFakeIo(["second"]);
    expect(await resolveOperator(fake.io, [owner, second], null)).toBe(second);
  });

  it("returns null when the operator declines to choose", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const fake = createFakeIo([""]);
    expect(await resolveOperator(fake.io, [owner, second], null)).toBeNull();
  });
});
