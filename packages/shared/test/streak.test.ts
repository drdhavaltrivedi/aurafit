import { describe, expect, it } from 'vitest';
import { applyDailyStreak, daysBetween, isDateKey, utcDateKey } from '../src/index';

describe('utcDateKey / isDateKey / daysBetween', () => {
  it('formats the UTC calendar day regardless of local offset', () => {
    expect(utcDateKey(new Date('2026-10-13T23:59:59.999Z'))).toBe('2026-10-13');
    expect(utcDateKey(new Date('2026-10-14T00:00:00Z'))).toBe('2026-10-14');
  });

  it('validates real calendar dates only', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('20261013')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it('counts whole days across month/year/DST boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysBetween('2026-10-14', '2026-10-13')).toBe(-1);
  });
});

describe('applyDailyStreak', () => {
  const today = '2026-10-13';

  it('starts at 1 on first activity', () => {
    expect(applyDailyStreak(null, today, 0, 2)).toEqual({ streakDays: 1, streakShields: 2, lastActiveDate: today, outcome: 'started' });
    expect(applyDailyStreak(undefined, today, 9, 0).streakDays).toBe(1);
    expect(applyDailyStreak('garbage', today, 9, 0).outcome).toBe('started');
  });

  it('increments at most once per calendar day', () => {
    expect(applyDailyStreak(today, today, 5, 1)).toEqual({ streakDays: 5, streakShields: 1, lastActiveDate: today, outcome: 'same_day' });
  });

  it('treats a clock that went backwards as the same day (never double counts)', () => {
    const r = applyDailyStreak('2026-10-14', today, 5, 1);
    expect(r).toEqual({ streakDays: 5, streakShields: 1, lastActiveDate: '2026-10-14', outcome: 'same_day' });
  });

  it('increments when active yesterday', () => {
    expect(applyDailyStreak('2026-10-12', today, 5, 1)).toEqual({ streakDays: 6, streakShields: 1, lastActiveDate: today, outcome: 'incremented' });
  });

  it('one missed day consumes a shield and keeps the streak alive', () => {
    expect(applyDailyStreak('2026-10-11', today, 5, 2)).toEqual({ streakDays: 6, streakShields: 1, lastActiveDate: today, outcome: 'shield_used' });
  });

  it('one missed day without shields resets to 1', () => {
    expect(applyDailyStreak('2026-10-11', today, 5, 0)).toEqual({ streakDays: 1, streakShields: 0, lastActiveDate: today, outcome: 'reset' });
  });

  it('two or more missed days reset to 1 and keep shields', () => {
    expect(applyDailyStreak('2026-10-10', today, 30, 3)).toEqual({ streakDays: 1, streakShields: 3, lastActiveDate: today, outcome: 'reset' });
  });

  it('sanitises invalid counters', () => {
    expect(applyDailyStreak('2026-10-12', today, Number.NaN, -4)).toEqual({ streakDays: 1, streakShields: 0, lastActiveDate: today, outcome: 'incremented' });
    expect(applyDailyStreak('2026-10-12', today, 2.9, 1.5).streakDays).toBe(3);
  });
});
