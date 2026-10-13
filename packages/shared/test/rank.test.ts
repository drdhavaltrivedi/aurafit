import { describe, expect, it } from 'vitest';
import { getRankFromAura, RANK_ORDER, RANK_THRESHOLDS, sanitizeAura, type HunterRank } from '../src/index';

describe('RANK_THRESHOLDS / RANK_ORDER', () => {
  it('lists every rank exactly once, in ascending threshold order', () => {
    expect([...RANK_ORDER].sort()).toEqual(Object.keys(RANK_THRESHOLDS).sort());
    for (let i = 1; i < RANK_ORDER.length; i++) {
      expect(RANK_THRESHOLDS[RANK_ORDER[i]]).toBeGreaterThan(RANK_THRESHOLDS[RANK_ORDER[i - 1]]);
    }
    expect(RANK_THRESHOLDS[RANK_ORDER[0]]).toBe(0);
  });
});

describe('getRankFromAura', () => {
  const cases: Array<[number, HunterRank]> = [
    [0, 'E-RANK'],
    [999, 'E-RANK'],
    [1000, 'D-RANK'],
    [2999, 'D-RANK'],
    [3000, 'C-RANK'],
    [6999, 'C-RANK'],
    [7000, 'B-RANK'],
    [14999, 'B-RANK'],
    [15000, 'A-RANK'],
    [29999, 'A-RANK'],
    [30000, 'S-RANK'],
    [59999, 'S-RANK'],
    [60000, 'MONARCH'],
    [1_000_000, 'MONARCH'],
  ];

  it.each(cases)('aura %d -> %s', (aura, rank) => {
    expect(getRankFromAura(aura).rank).toBe(rank);
  });

  it('every threshold boundary: exactly at threshold enters the rank, one below stays in previous', () => {
    RANK_ORDER.forEach((rank, i) => {
      const t = RANK_THRESHOLDS[rank];
      expect(getRankFromAura(t).rank).toBe(rank);
      if (i > 0) expect(getRankFromAura(t - 1).rank).toBe(RANK_ORDER[i - 1]);
      if (i > 0) expect(getRankFromAura(t - 0.5).rank).toBe(RANK_ORDER[i - 1]);
    });
  });

  it('reports the next rank and points needed', () => {
    RANK_ORDER.slice(0, -1).forEach((rank, i) => {
      const r = getRankFromAura(RANK_THRESHOLDS[rank]);
      expect(r.nextRank).toBe(RANK_ORDER[i + 1]);
      expect(r.pointsNeeded).toBe(RANK_THRESHOLDS[RANK_ORDER[i + 1]] - RANK_THRESHOLDS[rank]);
      expect(r.progressToNext).toBe(0);
    });
  });

  it('computes progress within a tier', () => {
    expect(getRankFromAura(500)).toEqual({ rank: 'E-RANK', nextRank: 'D-RANK', progressToNext: 50, pointsNeeded: 500 });
    expect(getRankFromAura(8450)).toEqual({ rank: 'B-RANK', nextRank: 'A-RANK', progressToNext: 18, pointsNeeded: 6550 });
  });

  it('never reports 100% progress before the next rank is reached', () => {
    const r = getRankFromAura(14999);
    expect(r.rank).toBe('B-RANK');
    expect(r.progressToNext).toBeLessThan(100);
    expect(r.pointsNeeded).toBe(1);
  });

  it('rounds pointsNeeded up for fractional aura', () => {
    expect(getRankFromAura(999.5).pointsNeeded).toBe(1);
    expect(Number.isInteger(getRankFromAura(1234.567).pointsNeeded)).toBe(true);
  });

  it('caps at MONARCH with no next rank', () => {
    for (const aura of [60000, 60001, 999_999_999, Number.MAX_SAFE_INTEGER, Infinity]) {
      expect(getRankFromAura(aura)).toEqual({ rank: 'MONARCH', nextRank: null, progressToNext: 100, pointsNeeded: 0 });
    }
  });

  it('treats negative, -Infinity and NaN as 0 aura', () => {
    const zero = getRankFromAura(0);
    expect(zero).toEqual({ rank: 'E-RANK', nextRank: 'D-RANK', progressToNext: 0, pointsNeeded: 1000 });
    for (const bad of [-1, -0.01, -50000, -Infinity, NaN]) {
      expect(getRankFromAura(bad)).toEqual(zero);
    }
  });

  it('always returns finite numbers in range', () => {
    for (const aura of [NaN, -1, 0, 1, 999, 1000, 45000, 60000, Infinity]) {
      const r = getRankFromAura(aura);
      expect(Number.isFinite(r.progressToNext)).toBe(true);
      expect(Number.isFinite(r.pointsNeeded)).toBe(true);
      expect(r.progressToNext).toBeGreaterThanOrEqual(0);
      expect(r.progressToNext).toBeLessThanOrEqual(100);
      expect(r.pointsNeeded).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('sanitizeAura', () => {
  it('maps invalid values to 0 and keeps valid ones', () => {
    expect(sanitizeAura(NaN)).toBe(0);
    expect(sanitizeAura(-5)).toBe(0);
    expect(sanitizeAura(-Infinity)).toBe(0);
    expect(sanitizeAura(0)).toBe(0);
    expect(sanitizeAura(42.5)).toBe(42.5);
    expect(sanitizeAura(Infinity)).toBe(Infinity);
    expect(sanitizeAura('100' as unknown as number)).toBe(0);
  });
});
