/**
 * Minimal in-memory token bucket, keyed per user.
 *
 * PER-INSTANCE ONLY: each server process / serverless instance keeps its own
 * buckets, so the effective limit scales with the number of instances and
 * resets on deploy. Good enough to blunt accidental hammering and naive
 * scripts; use a shared store (e.g. Redis / Upstash) for a strict global limit.
 * Game actions are additionally idempotent per day in the database.
 */
export interface RateLimitOptions {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Max tracked keys before the oldest are evicted. */
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until one token is available (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  take(key: string, now?: number): RateLimitResult;
  reset(): void;
}

export function createRateLimiter({ capacity, refillPerSecond, maxKeys = 10_000 }: RateLimitOptions): RateLimiter {
  const buckets = new Map<string, { tokens: number; updated: number }>();
  return {
    take(key, now = Date.now()) {
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) {
          const oldest = buckets.keys().next().value;
          if (oldest !== undefined) buckets.delete(oldest);
        }
        b = { tokens: capacity, updated: now };
      } else {
        buckets.delete(key); // re-insert to keep Map order ≈ LRU
        b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 1000) * refillPerSecond);
        b.updated = now;
      }
      buckets.set(key, b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return { allowed: true, remaining: Math.floor(b.tokens), retryAfterSeconds: 0 };
      }
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSecond)) };
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Shared limiter for mutating v1 endpoints: burst of 10, then 1 request / 2 s per user. */
export const mutationLimiter = createRateLimiter({ capacity: 10, refillPerSecond: 0.5 });
