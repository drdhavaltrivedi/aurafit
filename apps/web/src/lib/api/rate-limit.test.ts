import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter (token bucket)', () => {
  it('allows a burst up to capacity, then refills over time', () => {
    const rl = createRateLimiter({ capacity: 3, refillPerSecond: 1 });
    const t0 = 1_000_000;
    expect([0, 1, 2].map(() => rl.take('u', t0).allowed)).toEqual([true, true, true]);
    const denied = rl.take('u', t0);
    expect(denied).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1 });
    expect(rl.take('u', t0 + 1000).allowed).toBe(true);
    expect(rl.take('u', t0 + 1000).allowed).toBe(false);
  });

  it('never exceeds capacity after long idle periods', () => {
    const rl = createRateLimiter({ capacity: 2, refillPerSecond: 10 });
    rl.take('u', 0);
    expect(rl.take('u', 3_600_000).remaining).toBe(1);
  });

  it('keeps buckets independent per key and evicts beyond maxKeys', () => {
    const rl = createRateLimiter({ capacity: 1, refillPerSecond: 0.001, maxKeys: 2 });
    expect(rl.take('a', 0).allowed).toBe(true);
    expect(rl.take('b', 0).allowed).toBe(true);
    expect(rl.take('a', 0).allowed).toBe(false);
    rl.take('c', 0); // evicts least-recently used key ('b')
    expect(rl.take('b', 0).allowed).toBe(true);
  });
});
