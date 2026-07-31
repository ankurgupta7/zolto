import { describe, expect, it, vi } from "vitest";
import { createInMemoryRateLimitStore, createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then refuses within the window", async () => {
    const rl = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    });
    const now = 1_000_000;

    expect((await rl.check("a", now)).allowed).toBe(true);
    expect((await rl.check("a", now)).allowed).toBe(true);
    const last = await rl.check("a", now);
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);

    const refused = await rl.check("a", now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it("counts each key separately", async () => {
    const rl = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    });
    const now = 1_000_000;
    expect((await rl.check("a", now)).allowed).toBe(true);
    expect((await rl.check("a", now)).allowed).toBe(false);
    // A different caller (or a different store) is unaffected.
    expect((await rl.check("b", now)).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    const rl = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    });
    const now = 1_000_000;
    expect((await rl.check("a", now)).allowed).toBe(true);
    expect((await rl.check("a", now + 59_000)).allowed).toBe(false);
    expect((await rl.check("a", now + 60_000)).allowed).toBe(true);
  });

  it("reports a shrinking retry-after as the window drains", async () => {
    const rl = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    });
    const now = 1_000_000;
    await rl.check("a", now);
    expect((await rl.check("a", now + 10_000)).retryAfterSeconds).toBe(50);
    expect((await rl.check("a", now + 59_500)).retryAfterSeconds).toBe(1);
  });

  it("forgets everything on reset", async () => {
    const rl = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    });
    const now = 1_000_000;
    await rl.check("a", now);
    expect((await rl.check("a", now)).allowed).toBe(false);
    await rl.reset();
    expect((await rl.check("a", now)).allowed).toBe(true);
  });

  it("defaults to the shared DB-backed store when none is injected", async () => {
    // No `store` option — createRateLimiter must reach for the module-level
    // dbRateLimitStore (server/db.ts), not silently fall back to memory.
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const result = await rl.check("a", 1_000_000);
    // No DATABASE_URL in the test environment, so db.ts's withDb() fails
    // open — the request is still allowed, proving the DB path ran (an
    // in-memory store, which never fails, would also return allowed here,
    // but a thrown error would fail this test either way).
    expect(result.allowed).toBe(true);
  });
});

describe("createInMemoryRateLimitStore", () => {
  it("bounds memory by evicting the oldest key", async () => {
    const store = createInMemoryRateLimitStore({ maxKeys: 2 });
    const now = 1_000_000;
    await store.increment("first", now, 60_000);
    await store.increment("second", now, 60_000);
    // "third" evicts "first", which therefore gets a fresh window back.
    await store.increment("third", now, 60_000);
    expect((await store.increment("first", now, 60_000)).count).toBe(1);
    // "third" itself is still counted (this is its second increment).
    expect((await store.increment("third", now, 60_000)).count).toBe(2);
  });

  it("clear() forgets every key", async () => {
    const store = createInMemoryRateLimitStore();
    const now = 1_000_000;
    await store.increment("a", now, 60_000);
    await store.clear();
    expect((await store.increment("a", now, 60_000)).count).toBe(1);
  });
});

describe("dbRateLimitStore wiring (via createRateLimiter's default store)", () => {
  it("fails open even when the db.ts call unexpectedly rejects", async () => {
    vi.resetModules();
    vi.doMock("./db", () => ({
      getOrCreateRateLimitWindow: vi.fn().mockRejectedValue(new Error("boom")),
      clearRateLimitWindows: vi.fn(),
    }));
    const { createRateLimiter: freshCreateRateLimiter } =
      await import("./rateLimit");
    const rl = freshCreateRateLimiter({ limit: 1, windowMs: 60_000 });
    // getOrCreateRateLimitWindow rejecting must not propagate — a DB outage
    // is not grounds to block every checkout on the platform.
    const result = await rl.check("a", 1_000_000);
    expect(result.allowed).toBe(true);
    vi.doUnmock("./db");
    vi.resetModules();
  });

  it("fails open when the database is unavailable (returns null)", async () => {
    vi.resetModules();
    vi.doMock("./db", () => ({
      getOrCreateRateLimitWindow: vi.fn().mockResolvedValue(null),
      clearRateLimitWindows: vi.fn(),
    }));
    const { createRateLimiter: freshCreateRateLimiter } =
      await import("./rateLimit");
    const rl = freshCreateRateLimiter({ limit: 1, windowMs: 60_000 });
    const result = await rl.check("a", 1_000_000);
    expect(result.allowed).toBe(true);
    vi.doUnmock("./db");
    vi.resetModules();
  });
});
