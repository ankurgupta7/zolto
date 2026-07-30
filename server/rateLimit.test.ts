import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then refuses within the window", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000_000;

    expect(rl.check("a", now).allowed).toBe(true);
    expect(rl.check("a", now).allowed).toBe(true);
    const last = rl.check("a", now);
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);

    const refused = rl.check("a", now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it("counts each key separately", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000_000;
    expect(rl.check("a", now).allowed).toBe(true);
    expect(rl.check("a", now).allowed).toBe(false);
    // A different caller (or a different store) is unaffected.
    expect(rl.check("b", now).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000_000;
    expect(rl.check("a", now).allowed).toBe(true);
    expect(rl.check("a", now + 59_000).allowed).toBe(false);
    expect(rl.check("a", now + 60_000).allowed).toBe(true);
  });

  it("reports a shrinking retry-after as the window drains", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000_000;
    rl.check("a", now);
    expect(rl.check("a", now + 10_000).retryAfterSeconds).toBe(50);
    expect(rl.check("a", now + 59_500).retryAfterSeconds).toBe(1);
  });

  it("bounds memory by evicting the oldest key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    const now = 1_000_000;
    rl.check("first", now);
    rl.check("second", now);
    // "third" evicts "first", which therefore gets a fresh window back.
    rl.check("third", now);
    expect(rl.check("first", now).allowed).toBe(true);
    // "third" itself is still counted.
    expect(rl.check("third", now).allowed).toBe(false);
  });

  it("forgets everything on reset", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000_000;
    rl.check("a", now);
    expect(rl.check("a", now).allowed).toBe(false);
    rl.reset();
    expect(rl.check("a", now).allowed).toBe(true);
  });
});
