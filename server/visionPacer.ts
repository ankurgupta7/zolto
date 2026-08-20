// Token-rate pacing for the vision model.
//
// Groq meters qwen/qwen3.6-27b at 8,000 tokens per minute, and a single
// 1024px product photo costs roughly 1,330 prompt tokens — so the real
// ceiling is about six images a minute. A concurrency limit alone does not
// enforce that: two vision calls that each finish in four seconds still issue
// thirty images a minute. Requests have to be spaced by what they cost, not
// just counted.
//
// This is a token bucket. It refills continuously at the per-minute rate, and
// a caller waits until its own estimated cost fits before the request goes
// out. The budget belongs to the API key, so the instance below is shared
// process-wide rather than created per request.

export type TokenPacer = {
  /** Resolves once `cost` tokens of budget are available, and spends them. */
  acquire(cost: number): Promise<void>;
  /** Remaining budget right now — for assertions and diagnostics. */
  available(): number;
};

export type TokenPacerOptions = {
  tokensPerMinute: number;
  /** Injectable for tests; defaults to the real clock. */
  now?: () => number;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTokenPacer({
  tokensPerMinute,
  now = Date.now,
  sleep = realSleep,
}: TokenPacerOptions): TokenPacer {
  if (!(tokensPerMinute > 0)) {
    throw new Error(
      `createTokenPacer needs a positive tokensPerMinute, got ${tokensPerMinute}`,
    );
  }

  const capacity = tokensPerMinute;
  let tokens = capacity;
  let lastRefill = now();
  // Callers queue on this chain so they are served in arrival order. Without
  // it, everyone waiting would wake on the same refill and spend the window
  // simultaneously — which is the burst this exists to prevent.
  let queue: Promise<void> = Promise.resolve();

  const refill = () => {
    const at = now();
    const elapsedMs = Math.max(0, at - lastRefill);
    lastRefill = at;
    tokens = Math.min(capacity, tokens + (elapsedMs * capacity) / 60_000);
  };

  const take = async (cost: number) => {
    // A request that alone exceeds a whole minute's budget can never fit;
    // charge it the full window rather than deadlocking. It will still fail
    // upstream, but as a 429 the caller can report, not a hang.
    const needed = Math.min(Math.max(cost, 0), capacity);
    for (;;) {
      refill();
      if (tokens >= needed) {
        tokens -= needed;
        return;
      }
      const deficitMs = ((needed - tokens) * 60_000) / capacity;
      await sleep(Math.ceil(deficitMs));
    }
  };

  return {
    acquire(cost: number) {
      const turn = queue.then(() => take(cost));
      // Keep the chain alive even if a caller is abandoned mid-wait.
      queue = turn.catch(() => {});
      return turn;
    },
    available() {
      refill();
      return tokens;
    },
  };
}

// ─── The shared vision budget ─────────────────────────────────────────────────

// Measured against Groq: `x-ratelimit-limit-tokens: 8000` for
// qwen/qwen3.6-27b. Overridable for a different provider or paid tier.
export const VISION_TOKENS_PER_MINUTE = Number(
  process.env.LLM_VISION_TOKENS_PER_MINUTE ?? 8000,
);

// A 1024px image measured at ~1,330 prompt tokens.
export const VISION_TOKENS_PER_IMAGE = 1330;

// The analysis system prompt plus the JSON reply. Counted because the quota
// covers prompt and completion tokens alike; erring high here costs a little
// throughput, erring low costs a 429.
export const VISION_REQUEST_OVERHEAD_TOKENS = 800;

export const estimateVisionTokens = (imageCount: number): number =>
  VISION_REQUEST_OVERHEAD_TOKENS +
  Math.max(0, imageCount) * VISION_TOKENS_PER_IMAGE;

export const visionPacer = createTokenPacer({
  tokensPerMinute: VISION_TOKENS_PER_MINUTE,
});
