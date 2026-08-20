import { BRAND } from "@shared/brand";
import { describe, expect, it, vi } from "vitest";
import type { Tenant, User } from "../../drizzle/schema";
import type { AdminCaller } from "./caller";
import { createFakeIo } from "./fakeIo";
import { type SessionDeps, ShellSession, type StoreChoice } from "./session";

const operator = {
  id: 1,
  tenantId: 1,
  role: "superadmin",
  email: `owner@${BRAND.domain}`,
} as unknown as User;

const kalakosh = { id: 3, slug: "kalakosh", name: "Kalakosh" } as Tenant;
const other = { id: 7, slug: "other", name: "Other Store" } as Tenant;

const choices: StoreChoice[] = [
  { id: 3, slug: "kalakosh", name: "Kalakosh", plan: "free" },
  { id: 7, slug: "other", name: "Other Store", plan: "pro" },
];

function makeSession(answers: string[], overrides: Partial<SessionDeps> = {}) {
  const fake = createFakeIo(answers);
  const callerFor = vi.fn(
    (tenant: Tenant | null) => ({ tenant }) as unknown as AdminCaller,
  );
  const deps: SessionDeps = {
    listStores: async () => choices,
    loadStore: async (id) => [kalakosh, other].find((t) => t.id === id) ?? null,
    callerFor,
    ...overrides,
  };
  const session = new ShellSession({
    io: fake.io,
    operator,
    readOnly: false,
    deps,
  });
  return { fake, session, callerFor, deps };
}

describe("ShellSession", () => {
  it("builds its platform caller with no store, so cross-tenant reads stay cross-tenant", () => {
    const { callerFor } = makeSession([]);
    expect(callerFor).toHaveBeenCalledWith(null);
  });

  it("starts with no store selected", () => {
    const { session } = makeSession([]);
    expect(session.currentStore()).toBeNull();
    expect(session.storeLabel()).toBeNull();
  });

  it("labels the working store for the menu header", () => {
    const { session } = makeSession([]);
    session.setStore(kalakosh);
    expect(session.storeLabel()).toBe("Kalakosh (kalakosh)");
  });

  it("asks which store when none is selected, and remembers the answer", async () => {
    const { session, fake } = makeSession(["kalakosh"]);
    const scope = await session.requireStore();
    expect(scope?.tenant).toBe(kalakosh);
    expect(session.currentStore()).toBe(kalakosh);
    expect(fake.text()).toContain("Working store is now Kalakosh (kalakosh)");
  });

  it("returns null when the operator backs out of the picker", async () => {
    const { session } = makeSession([""]);
    expect(await session.requireStore()).toBeNull();
    expect(session.currentStore()).toBeNull();
  });

  it("re-reads the store row each time — plan and comp are what the gates read", async () => {
    const loadStore = vi.fn(async () => kalakosh);
    const { session } = makeSession([], { loadStore });
    session.setStore(kalakosh);

    await session.requireStore();
    await session.requireStore();
    expect(loadStore).toHaveBeenCalledTimes(2);
  });

  it("picks up a plan change made a menu ago rather than reusing a stale row", async () => {
    const upgraded = { ...kalakosh, plan: "pro" } as Tenant;
    const loadStore = vi.fn(async () => upgraded);
    const { session } = makeSession([], { loadStore });
    session.setStore(kalakosh);

    const scope = await session.requireStore();
    expect(scope?.tenant.plan).toBe("pro");
    expect(session.currentStore()?.plan).toBe("pro");
  });

  it("scopes the caller to the store it hands back", async () => {
    const { session, callerFor } = makeSession([]);
    session.setStore(kalakosh);
    await session.requireStore();
    expect(callerFor).toHaveBeenCalledWith(kalakosh);
  });

  it("recovers when the selected store has been deleted underneath it", async () => {
    const loadStore = vi
      .fn<(id: number) => Promise<Tenant | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(other);
    const { session, fake } = makeSession(["other"], { loadStore });
    session.setStore(kalakosh);

    const scope = await session.requireStore();
    expect(fake.text()).toContain("no longer exists");
    expect(scope?.tenant).toBe(other);
  });

  it("says so rather than crashing when the chosen row cannot be loaded", async () => {
    const { session, fake } = makeSession(["kalakosh"], {
      loadStore: async () => null,
    });
    expect(await session.requireStore()).toBeNull();
    expect(fake.text()).toContain("Could not load store");
  });

  it("explains an empty platform instead of prompting for a store that cannot exist", async () => {
    const { session, fake } = makeSession([], { listStores: async () => [] });
    expect(await session.requireStore()).toBeNull();
    expect(fake.text()).toContain("no stores on this platform yet");
  });
});
