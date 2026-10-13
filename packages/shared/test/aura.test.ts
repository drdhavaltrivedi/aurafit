import { describe, expect, it } from 'vitest';
import {
  calculateAuraGain,
  calculateQuestProgress,
  MAX_STREAK_BONUS_PERCENT,
  STREAK_BONUS_PERCENT_PER_DAY,
  toNonNegativeFinite,
} from '../src/index';

describe('calculateAuraGain', () => {
  it('returns the base reward with no streak and default multiplier', () => {
    expect(calculateAuraGain(250, 0)).toBe(250);
    expect(calculateAuraGain(250, 0, 1)).toBe(250);
  });

  it('adds +5% per streak day', () => {
    expect(STREAK_BONUS_PERCENT_PER_DAY).toBe(5);
    expect(calculateAuraGain(100, 1)).toBe(105);
    expect(calculateAuraGain(100, 3)).toBe(115); // naive float math gives 114.99999999999999
    expect(calculateAuraGain(100, 9)).toBe(145);
  });

  it('caps the streak bonus at +50%', () => {
    expect(MAX_STREAK_BONUS_PERCENT).toBe(50);
    expect(calculateAuraGain(100, 10)).toBe(150);
    expect(calculateAuraGain(100, 11)).toBe(150);
    expect(calculateAuraGain(100, 14)).toBe(150);
    expect(calculateAuraGain(100, 10_000)).toBe(150);
    expect(calculateAuraGain(100, Infinity)).toBe(100); // non-finite streak is invalid -> 0
  });

  it('treats zero, negative and NaN streaks as no bonus (never a penalty)', () => {
    expect(calculateAuraGain(100, 0)).toBe(100);
    expect(calculateAuraGain(100, -1)).toBe(100);
    expect(calculateAuraGain(100, -100)).toBe(100);
    expect(calculateAuraGain(100, NaN)).toBe(100);
  });

  it('floors fractional streak days', () => {
    expect(calculateAuraGain(100, 1.9)).toBe(105);
    expect(calculateAuraGain(100, 0.99)).toBe(100);
  });

  it('applies the multiplier', () => {
    expect(calculateAuraGain(450, 0, 1.5)).toBe(675);
    expect(calculateAuraGain(450, 14, 1.5)).toBe(1013); // 1012.5 rounds half up
    expect(calculateAuraGain(1500, 14, 1.8)).toBe(4050);
    expect(calculateAuraGain(100, 0, 0)).toBe(0);
    expect(calculateAuraGain(100, 0, 0.5)).toBe(50);
  });

  it('rounds to the nearest integer', () => {
    expect(calculateAuraGain(10, 1)).toBe(11); // 10.5
    expect(calculateAuraGain(7, 2)).toBe(8); // 7.7
    expect(calculateAuraGain(3, 0, 1.1)).toBe(3); // 3.3
    expect(Number.isInteger(calculateAuraGain(333, 7, 1.37))).toBe(true);
  });

  it('never returns negative, NaN or Infinity for invalid inputs', () => {
    expect(calculateAuraGain(-100, 5)).toBe(0);
    expect(calculateAuraGain(NaN, 5)).toBe(0);
    expect(calculateAuraGain(Infinity, 5)).toBe(0);
    expect(calculateAuraGain(100, 5, -2)).toBe(0);
    expect(calculateAuraGain(100, 5, NaN)).toBe(0);
    expect(calculateAuraGain(100, 5, Infinity)).toBe(0);
    for (const v of [calculateAuraGain(-1, -1, -1), calculateAuraGain(NaN, NaN, NaN)]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns 0 for a 0 reward regardless of streak', () => {
    expect(calculateAuraGain(0, 50, 2)).toBe(0);
  });
});

describe('calculateQuestProgress', () => {
  it('computes floor percentage clamped to 0-100', () => {
    expect(calculateQuestProgress(15, 50)).toBe(30);
    expect(calculateQuestProgress(340, 500)).toBe(68);
    expect(calculateQuestProgress(4, 4)).toBe(100);
    expect(calculateQuestProgress(1, 3)).toBe(33);
    expect(calculateQuestProgress(2, 3)).toBe(66);
    expect(calculateQuestProgress(99, 100)).toBe(99);
    expect(calculateQuestProgress(600, 500)).toBe(100);
  });

  it('handles invalid inputs', () => {
    expect(calculateQuestProgress(5, 0)).toBe(0);
    expect(calculateQuestProgress(-5, 10)).toBe(0);
    expect(calculateQuestProgress(NaN, 10)).toBe(0);
    expect(calculateQuestProgress(5, NaN)).toBe(0);
    expect(calculateQuestProgress(5, -10)).toBe(0);
  });
});

describe('toNonNegativeFinite', () => {
  it('passes valid numbers and falls back otherwise', () => {
    expect(toNonNegativeFinite(3)).toBe(3);
    expect(toNonNegativeFinite(0)).toBe(0);
    expect(toNonNegativeFinite(-1)).toBe(0);
    expect(toNonNegativeFinite(NaN, 7)).toBe(7);
    expect(toNonNegativeFinite(Infinity, 1)).toBe(1);
  });
});
