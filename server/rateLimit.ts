/**
 * A small in-process rate limiter for public write endpoints.
 *
 * Zolto's public MCP endpoint lets any AI agent start a checkout, and starting
 * a checkout *reserves inventory* for 30 minutes. Without a limit, one looping
 * agent could hold a vendor's entire stall catalogue and nobody else — human
 * or agent — could buy. That's the specific harm this guards against.
 *
 * Scope, stated plainly: counters live in this process's memory. On a single
 * app instance that is the real limit; behind multiple instances each one
 * enforces its own share, and everything resets on deploy. That is a
 * deliberate trade — it removes the trivial abuse case with no new
 * infrastructure — not a claim of distributed rate limiting. Move the counters
 * to Redis (or the DB) when Zolto runs more than one instance.
 */

interface Window {
  /** Requests counted in the current window. */
  count: number;
  /** When the current window ends (epoch ms). */
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in this window. */
  remaining: number;
  /** Seconds until the window resets — what to tell the caller to wait. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check: (key: string, now?: number) => RateLimitResult;
  reset: () => void;
}

/**
 * Fixed-window limiter: `limit` requests per `windowMs` per key.
 *
 * Fixed windows can allow up to 2x the limit across a window boundary. For
 * "stop a runaway loop from hoarding inventory" that is entirely adequate,
 * and it costs one map entry per caller instead of a list of timestamps.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  /** Entries to keep before evicting the oldest — bounds memory. */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = opts;
  const windows = new Map<string, Window>();

  return {
    check(key, now = Date.now()) {
      const existing = windows.get(key);

      if (!existing || now >= existing.resetAt) {
        // A Map iterates in insertion order, so the first key is the oldest.
        // Evicting it bounds memory even if keys are attacker-controlled (an
        // IP per request); an evicted caller simply starts a fresh window.
        if (!existing && windows.size >= maxKeys) {
          const oldest = windows.keys().next().value;
          if (oldest !== undefined) windows.delete(oldest);
        }
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return {
          allowed: true,
          remaining: limit - 1,
          retryAfterSeconds: Math.ceil(windowMs / 1000),
        };
      }

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      if (existing.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: limit - existing.count,
        retryAfterSeconds,
      };
    },

    reset() {
      windows.clear();
    },
  };
}
