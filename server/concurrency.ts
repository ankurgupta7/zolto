// Bounded-parallelism version of `Promise.all(items.map(fn))`.
//
// `Promise.all` starts every task at once, which is fine for cheap local work
// and wrong for anything metered upstream: a 20-group bulk image analysis
// fires 20 simultaneous vision requests, blows straight through the provider's
// per-minute token budget, and comes back as a wall of 429s that fail groups
// the user has already waited for.
//
// Results keep the input order regardless of completion order, and a rejected
// task rejects the whole call — same contract as `Promise.all`, minus the
// stampede.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `mapWithConcurrency limit must be a positive integer, got ${limit}`,
    );
  }

  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );

  return results;
}
