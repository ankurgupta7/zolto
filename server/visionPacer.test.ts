import { describe, expect, it } from "vitest";
import {
  VISION_TOKENS_PER_IMAGE,
  VISION_TOKENS_PER_MINUTE,
  createTokenPacer,
  estimateVisionTokens,
} from "./visionPacer";

// A controllable clock: sleeping advances virtual time instead of real time,
// so a test can watch a minute of pacing pass instantly.
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    elapsed: () => t - start,
  };
}

describe("createTokenPacer", () => {
  it("lets a request through immediately while budget remains", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await pacer.acquire(2000);
    expect(clock.elapsed()).toBe(0);
    expect(pacer.available()).toBeCloseTo(6000, 5);
  });

  it("makes a request wait once the window is spent", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await pacer.acquire(8000); // drains the bucket
    expect(clock.elapsed()).toBe(0);

    await pacer.acquire(4000); // half a window must refill first
    expect(clock.elapsed()).toBeGreaterThanOrEqual(30_000);
  });

  it("holds the long-run rate to the configured budget", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    // 12 single-image groups: 12 × 2,130 = 25,560 tokens. The bucket starts
    // full, so the first 8,000 are free and the remaining 17,560 have to be
    // earned at 8,000/minute — a bit over two minutes.
    const cost = estimateVisionTokens(1);
    for (let i = 0; i < 12; i++) await pacer.acquire(cost);

    const spentBeyondFirstWindow = 12 * cost - 8000;
    const expectedMs = (spentBeyondFirstWindow / 8000) * 60_000;
    expect(clock.elapsed()).toBeGreaterThanOrEqual(expectedMs - 1);
    // And it is not waiting longer than it needs to.
    expect(clock.elapsed()).toBeLessThan(expectedMs + 1000);
  });

  it("refills continuously rather than in whole-minute steps", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 6000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await pacer.acquire(6000);
    clock.advance(10_000); // a sixth of a minute
    expect(pacer.available()).toBeCloseTo(1000, 5);
  });

  it("never accumulates more than one window of budget", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    clock.advance(10 * 60_000); // idle for ten minutes
    expect(pacer.available()).toBe(8000);
  });

  it("serves concurrent callers in arrival order", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map(async (n) => {
        await pacer.acquire(3000);
        order.push(n);
      }),
    );

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not let a burst of concurrent callers oversubscribe the window", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 8000,
      now: clock.now,
      sleep: clock.sleep,
    });

    // Eight simultaneous groups — the burst that returned 2 successes and 6
    // rate-limit errors against the live API.
    const cost = estimateVisionTokens(1);
    await Promise.all(Array.from({ length: 8 }, () => pacer.acquire(cost)));

    const overBudget = 8 * cost - 8000;
    expect(clock.elapsed()).toBeGreaterThanOrEqual(
      (overBudget / 8000) * 60_000 - 1,
    );
  });

  it("charges an oversized request one window instead of deadlocking", async () => {
    const clock = fakeClock();
    const pacer = createTokenPacer({
      tokensPerMinute: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await pacer.acquire(50_000);
    expect(pacer.available()).toBeCloseTo(0, 5);
  });

  it("rejects a non-positive budget", () => {
    expect(() => createTokenPacer({ tokensPerMinute: 0 })).toThrow(
      /positive tokensPerMinute/,
    );
    expect(() => createTokenPacer({ tokensPerMinute: -1 })).toThrow(
      /positive tokensPerMinute/,
    );
  });
});

describe("estimateVisionTokens", () => {
  it("scales with the image count on top of a fixed prompt cost", () => {
    const one = estimateVisionTokens(1);
    const two = estimateVisionTokens(2);
    expect(two - one).toBe(VISION_TOKENS_PER_IMAGE);
  });

  it("still charges the prompt for a group with no images", () => {
    expect(estimateVisionTokens(0)).toBeGreaterThan(0);
  });

  it("fits a typical group inside a single minute's budget", () => {
    // A group is one product's photos. Anything that fits a window can be
    // paced properly; anything that doesn't can only get through by the
    // oversized-request escape hatch, i.e. by being rate-limited first.
    expect(estimateVisionTokens(5)).toBeLessThanOrEqual(
      VISION_TOKENS_PER_MINUTE,
    );
  });

  it("documents that a maximum-size group does NOT fit one window", () => {
    // bulkAnalyze accepts up to 8 photos per group, which at ~1,330 tokens an
    // image is over 11,000 — more than the whole 8,000/minute budget. Such a
    // group can only be served by spending a full window and then being
    // throttled, so it succeeds via retry rather than via pacing. Lowering
    // the per-group cap to 5 would remove that cliff entirely; until then this
    // records the limitation rather than pretending it isn't there.
    expect(estimateVisionTokens(8)).toBeGreaterThan(VISION_TOKENS_PER_MINUTE);
  });

  it("agrees with the measured ~6 images/minute ceiling", () => {
    const perImageBudget = VISION_TOKENS_PER_MINUTE / estimateVisionTokens(1);
    expect(perImageBudget).toBeGreaterThan(3);
    expect(perImageBudget).toBeLessThan(8);
  });
});
