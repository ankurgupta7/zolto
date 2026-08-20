import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency";

// A deferred promise per index, so a test can decide exactly when each task
// finishes and observe how many are running while others are still pending.
function makeGate<R>() {
  const resolvers: Array<(value: R) => void> = [];
  const inFlight: number[] = [];
  let running = 0;
  let peak = 0;

  const fn = (_item: unknown, index: number) => {
    running++;
    peak = Math.max(peak, running);
    inFlight.push(index);
    return new Promise<R>((resolve) => {
      resolvers[index] = (value) => {
        running--;
        resolve(value);
      };
    });
  };

  return {
    fn,
    peak: () => peak,
    started: () => [...inFlight],
    settle: (index: number, value: R) => resolvers[index](value),
  };
}

describe("mapWithConcurrency", () => {
  it("returns an empty array for no items without invoking the mapper", async () => {
    const fn = vi.fn();
    await expect(mapWithConcurrency([], 2, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps every item and preserves input order", async () => {
    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 2,
    );
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("keeps input order even when later tasks finish first", async () => {
    const gate = makeGate<string>();
    const promise = mapWithConcurrency(["a", "b"], 2, gate.fn);

    // Second task resolves before the first.
    gate.settle(1, "second");
    gate.settle(0, "first");

    await expect(promise).resolves.toEqual(["first", "second"]);
  });

  it("never runs more than `limit` tasks at once", async () => {
    const gate = makeGate<number>();
    const promise = mapWithConcurrency([0, 1, 2, 3, 4], 2, gate.fn);

    // Only the first two may have started; the rest wait for a free slot.
    await Promise.resolve();
    expect(gate.started()).toEqual([0, 1]);

    gate.settle(0, 0);
    await Promise.resolve();
    await Promise.resolve();
    expect(gate.started()).toEqual([0, 1, 2]);

    for (const i of [1, 2, 3, 4]) {
      gate.settle(i, i);
      await Promise.resolve();
      await Promise.resolve();
    }

    await promise;
    expect(gate.peak()).toBeLessThanOrEqual(2);
  });

  it("runs strictly one at a time at limit 1", async () => {
    const order: string[] = [];
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(`start-${n}`);
      await Promise.resolve();
      order.push(`end-${n}`);
      return n;
    });

    expect(order).toEqual([
      "start-1",
      "end-1",
      "start-2",
      "end-2",
      "start-3",
      "end-3",
    ]);
  });

  it("does not spawn more workers than there are items", async () => {
    const gate = makeGate<number>();
    const promise = mapWithConcurrency([0], 8, gate.fn);
    await Promise.resolve();
    expect(gate.started()).toEqual([0]);
    gate.settle(0, 0);
    await promise;
  });

  it("rejects with the first task error, like Promise.all", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("rejects a limit below 1 rather than silently stalling", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
    await expect(mapWithConcurrency([1], -1, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
    await expect(mapWithConcurrency([1], 1.5, async (n) => n)).rejects.toThrow(
      /positive integer/,
    );
  });
});
