// ==========================================
// DAILY STREAK RULE
// Mirrored 1:1 by private.apply_daily_streak() in packages/shared/schema.sql.
// packages/shared/test/game-functions.test.ts checks both implementations agree.
// ==========================================

/** ISO calendar date in UTC, e.g. "2026-10-13". Used as the activity `date_key`. */
export type DateKey = string;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** UTC calendar day (YYYY-MM-DD) for a timestamp. */
export function utcDateKey(date: Date = new Date()): DateKey {
  return date.toISOString().slice(0, 10);
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && utcDateKey(new Date(t)) === value;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD, UTC). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export type StreakOutcome =
  /** First recorded activity: streak starts at 1. */
  | 'started'
  /** Already active today (or clock went backwards): nothing changes. */
  | 'same_day'
  /** Active yesterday: streak +1. */
  | 'incremented'
  /** Exactly one day missed and a shield was available: shield consumed, streak +1. */
  | 'shield_used'
  /** Gap too large (or one missed day without a shield): streak restarts at 1. */
  | 'reset';

export interface StreakState {
  streakDays: number;
  streakShields: number;
  lastActiveDate: DateKey;
  outcome: StreakOutcome;
}

const nonNegInt = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Applies one activity on `today` to a streak.
 *
 * - The streak increments at most once per UTC calendar day of activity.
 * - Exactly one missed day consumes a streak shield if one is available
 *   (the streak survives and still increments for today); otherwise the
 *   streak resets to 1.
 * - Two or more missed days always reset to 1 (shields are kept).
 */
export function applyDailyStreak(
  prevLastActiveDate: DateKey | null | undefined,
  today: DateKey,
  streakDays: number,
  shields: number,
): StreakState {
  const streak = nonNegInt(streakDays);
  const shieldCount = nonNegInt(shields);

  if (!prevLastActiveDate || !isDateKey(prevLastActiveDate)) {
    return { streakDays: 1, streakShields: shieldCount, lastActiveDate: today, outcome: 'started' };
  }

  const gap = daysBetween(prevLastActiveDate, today);
  if (gap <= 0) {
    return { streakDays: streak, streakShields: shieldCount, lastActiveDate: prevLastActiveDate, outcome: 'same_day' };
  }
  if (gap === 1) {
    return { streakDays: streak + 1, streakShields: shieldCount, lastActiveDate: today, outcome: 'incremented' };
  }
  if (gap === 2 && shieldCount > 0) {
    return { streakDays: streak + 1, streakShields: shieldCount - 1, lastActiveDate: today, outcome: 'shield_used' };
  }
  return { streakDays: 1, streakShields: shieldCount, lastActiveDate: today, outcome: 'reset' };
}
