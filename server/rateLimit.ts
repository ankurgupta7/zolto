/**
 * A rate limiter for public write endpoints, backed by a shared MySQL table
 * (rate_limit_windows) so the limit holds across every app instance and
 * survives a deploy — the previous in-process Map reset per instance and on
 * every restart, which is honest for one instance but silently multiplies
 * the effective limit by instance count once there is more than one.
 *
 * Zolto's public MCP endpoint lets any AI agent start a checkout, and starting
 * a checkout *reserves inventory* for 30 minutes. Without a limit, one looping
 * agent could hold a vendor's entire stall catalogue and nobody else — human
 * or agent — could buy. That's the specific harm this guards against.
 *
 * Fails open on a database outage (see dbRateLimitStore below): a rate
 * limiter is a soft abuse guard, not a payment or inventory invariant, so a
 * transient DB hiccup must never become a reason every checkout fails.
 */

import { getOrCreateRateLimitWindow, clearRateLimitWindows } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in this window. */
  remaining: number;
  /** Seconds until the window resets — what to tell the caller to wait. */
  retryAfterSeconds: number;
}

/** Where window counters actually live. Pluggable so tests don't need a DB. */
export interface RateLimitStore {
  /** Atomically counts `key` in its current window, starting a fresh one if the previous window has expired. */
  increment(
    key: string,
    now: number,
    windowMs: number,
  ): Promise<{ count: number; resetAt: number }>;
  clear(): Promise<void>;
}

/**
 * In-process store: the old default, kept for tests (fast, no DB) and as a
 * reference implementation of the fixed-window algorithm.
 */
export function createInMemoryRateLimitStore(
  opts: { maxKeys?: number } = {},
): RateLimitStore {
  const { maxKeys = 10_000 } = opts;
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async increment(key, now, windowMs) {
      const existing = windows.get(key);
      if (!existing || now >= existing.resetAt) {
        // A Map iterates in insertion order, so the first key is the oldest.
        // Evicting it bounds memory even if keys are attacker-controlled (an
        // IP per request); an evicted caller simply starts a fresh window.
        if (!existing && windows.size >= maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest !== undefined) windows.delete(oldest);
        }
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      existing.count += 1;
      return existing;
    },
    async clear() {
      windows.clear();
    },
  };
}

const dbRateLimitStore: RateLimitStore = {
  async increment(key, now, windowMs) {
    // getOrCreateRateLimitWindow already fails open internally (returns
    // null rather than throwing), but a soft abuse guard is worth defending
    // twice: even an unexpected rejection here must fail open, not block
    // checkout platform-wide over an outage.
    try {
      const result = await getOrCreateRateLimitWindow(key, now, windowMs);
      return result ?? { count: 1, resetAt: now + windowMs };
    } catch (err) {
      console.error("[RateLimit] DB store errored, failing open:", err);
      return { count: 1, resetAt: now + windowMs };
    }
  },
  async clear() {
    await clearRateLimitWindows();
  },
};

export interface RateLimiter {
  check: (key: string, now?: number) => Promise<RateLimitResult>;
  reset: () => Promise<void>;
}

/**
 * Fixed-window limiter: `limit` requests per `windowMs` per key.
 *
 * Fixed windows can allow up to 2x the limit across a window boundary. For
 * "stop a runaway loop from hoarding inventory" that is entirely adequate,
 * and it costs one row per caller instead of a list of timestamps.
 *
 * Defaults to the shared DB-backed store; pass `store` to use
 * `createInMemoryRateLimitStore()` instead (tests, or a single-instance
 * deployment that wants to avoid the extra DB round trip).
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  store?: RateLimitStore;
}): RateLimiter {
  const { limit, windowMs, store = dbRateLimitStore } = opts;

  return {
    async check(key, now = Date.now()) {
      const { count, resetAt } = await store.increment(key, now, windowMs);
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      if (count > limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      return {
        allowed: true,
        remaining: limit - count,
        retryAfterSeconds,
      };
    },

    async reset() {
      await store.clear();
    },
  };
}
