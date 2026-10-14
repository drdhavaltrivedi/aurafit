import { describe, expect, it } from 'vitest';
import {
  buildOnboardingNotificationSettings,
  DEFAULT_FIRST_WORKOUT_ID,
  FIRST_WORKOUT_PREFERENCES,
  FITNESS_GOALS,
  FITNESS_LEVELS,
  formatOnboardingHour,
  isDifficultyAllowed,
  isNonFatalSettingsStatus,
  normalizeUsername,
  recommendFirstWorkout,
  STARTER_DROP_IDS,
  validateUpdateMe,
  type WorkoutDrop,
} from '../src/index';

/** Difficulties from supabase/migrations/20261014090000_starter_library.sql. */
const STARTER: Array<Pick<WorkoutDrop, 'id' | 'difficulty'>> = [
  { id: 'af_first_quest_fullbody', difficulty: 'NOVICE' },
  { id: 'af_desk_reset_5', difficulty: 'NOVICE' },
  { id: 'af_hiit_ignite_15', difficulty: 'HUNTER' },
  { id: 'af_push_power_20', difficulty: 'HUNTER' },
  { id: 'af_leg_day_lite_18', difficulty: 'HUNTER' },
  { id: 'af_core_armor_10', difficulty: 'NOVICE' },
  { id: 'af_cardio_snack_7', difficulty: 'NOVICE' },
  { id: 'af_mobility_flow_12', difficulty: 'NOVICE' },
  { id: 'af_tabata_burn_16', difficulty: 'BEAST' },
  { id: 'af_monarch_challenge_25', difficulty: 'SHADOW' },
];
const difficultyOf = (id: string) => STARTER.find((d) => d.id === id)!.difficulty;

describe('recommendFirstWorkout', () => {
  it('fixture covers exactly the official starter library', () => {
    expect(STARTER.map((d) => d.id).sort()).toEqual([...STARTER_DROP_IDS].sort());
  });

  it.each(FITNESS_GOALS.flatMap((g) => FITNESS_LEVELS.map((l) => [g, l] as const)))(
    '%s / %s → an official, level-appropriate drop',
    (goal, level) => {
      const id = recommendFirstWorkout(goal, level, STARTER);
      expect(id).toMatch(/^af_/);
      expect(isDifficultyAllowed(level, difficultyOf(id!))).toBe(true);
      expect(id).toBe(FIRST_WORKOUT_PREFERENCES[goal][level][0]);
    },
  );

  it('beginners never get BEAST or SHADOW, even if those are the only drops listed first', () => {
    for (const goal of FITNESS_GOALS) {
      const id = recommendFirstWorkout(goal, 'BEGINNER', STARTER);
      expect(['BEAST', 'SHADOW']).not.toContain(difficultyOf(id!));
      expect(difficultyOf(id!)).toBe('NOVICE');
    }
    expect(recommendFirstWorkout('LOSE_WEIGHT', 'BEGINNER', [{ id: 'af_tabata_burn_16', difficulty: 'BEAST' }])).toBeNull();
  });

  it('intermediates cap at HUNTER; advanced get the hard stuff', () => {
    expect(isDifficultyAllowed('INTERMEDIATE', 'BEAST')).toBe(false);
    expect(recommendFirstWorkout('LOSE_WEIGHT', 'ADVANCED', STARTER)).toBe('af_tabata_burn_16');
    expect(recommendFirstWorkout('BUILD_STRENGTH', 'ADVANCED', STARTER)).toBe('af_monarch_challenge_25');
    expect(recommendFirstWorkout('MOBILITY', 'ADVANCED', STARTER)).toBe('af_mobility_flow_12');
  });

  it('skips preferred drops that are missing from the catalog', () => {
    const without = STARTER.filter((d) => d.id !== 'af_mobility_flow_12');
    expect(recommendFirstWorkout('MOBILITY', 'BEGINNER', without)).toBe('af_desk_reset_5');
    const onlyDefault = STARTER.filter((d) => d.id === DEFAULT_FIRST_WORKOUT_ID || d.difficulty !== 'NOVICE');
    expect(recommendFirstWorkout('BUILD_HABIT', 'BEGINNER', onlyDefault)).toBe(DEFAULT_FIRST_WORKOUT_ID);
  });

  it('falls back to any level-appropriate drop, then null', () => {
    expect(recommendFirstWorkout('GET_FIT', 'BEGINNER', [{ id: 'drop_x', difficulty: 'NOVICE' }])).toBe('drop_x');
    expect(recommendFirstWorkout('GET_FIT', 'BEGINNER', [])).toBeNull();
  });

  it('treats a missing goal/level as GET_FIT / BEGINNER', () => {
    expect(recommendFirstWorkout(null, undefined, STARTER)).toBe(recommendFirstWorkout('GET_FIT', 'BEGINNER', STARTER));
    expect(recommendFirstWorkout('NOPE' as never, 'X' as never, STARTER)).toBe('af_first_quest_fullbody');
  });
});

describe('validateUpdateMe', () => {
  it('accepts a full onboarding body and normalises the username', () => {
    expect(
      validateUpdateMe({ fitnessGoal: 'GET_FIT', fitnessLevel: 'ADVANCED', username: '  Sung   Jinwoo ', completeOnboarding: true }),
    ).toEqual({ ok: true, value: { fitnessGoal: 'GET_FIT', fitnessLevel: 'ADVANCED', username: 'Sung Jinwoo', completeOnboarding: true } });
  });

  it('rejects non-objects, empty bodies and unknown keys', () => {
    for (const v of [null, 'x', 1, [], undefined]) expect(validateUpdateMe(v).ok).toBe(false);
    expect(validateUpdateMe({})).toEqual({ ok: false, fieldErrors: { body: expect.any(String) } });
    const r = validateUpdateMe({ fitnessGoal: 'GET_FIT', onboarded_at: '2020-01-01', role: 'ADMIN' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['onboarded_at', 'role']);
  });

  it('rejects bad enum values, bad usernames and completeOnboarding other than true', () => {
    const r = validateUpdateMe({ fitnessGoal: 'get_fit', fitnessLevel: 3, username: '   ', completeOnboarding: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(['completeOnboarding', 'fitnessGoal', 'fitnessLevel', 'username']);
    expect(validateUpdateMe({ username: 'x'.repeat(51) }).ok).toBe(false);
    expect(validateUpdateMe({ username: 'x'.repeat(50) }).ok).toBe(true);
    expect(validateUpdateMe({ username: 'bad\u0007name' }).ok).toBe(false);
    expect(validateUpdateMe({ username: 42 }).ok).toBe(false);
    expect(validateUpdateMe({ completeOnboarding: 'true' }).ok).toBe(false);
  });

  it('normalizeUsername', () => {
    expect(normalizeUsername(' a  b ')).toEqual({ ok: true, value: 'a b' });
    expect(normalizeUsername('').ok).toBe(false);
  });
});

describe('reminder helpers', () => {
  it('builds the notification-settings body with streak saver on by default', () => {
    expect(buildOnboardingNotificationSettings(18, 'Europe/Berlin')).toEqual({ timezone: 'Europe/Berlin', streakSaver: true, dailyReminderHour: 18 });
    expect(buildOnboardingNotificationSettings(null, 'UTC')).toEqual({ timezone: 'UTC', streakSaver: true, dailyReminderHour: null });
    expect(buildOnboardingNotificationSettings(24, 'UTC').dailyReminderHour).toBeNull();
    expect(buildOnboardingNotificationSettings(7.5, 'UTC').dailyReminderHour).toBeNull();
    expect(typeof buildOnboardingNotificationSettings(7).timezone).toBe('string');
  });

  it('404 / 501 are non-fatal; other errors are not', () => {
    expect(isNonFatalSettingsStatus(404)).toBe(true);
    expect(isNonFatalSettingsStatus(501)).toBe(true);
    expect(isNonFatalSettingsStatus(500)).toBe(false);
    expect(isNonFatalSettingsStatus(400)).toBe(false);
  });

  it('formats hours', () => {
    expect([0, 7, 12, 18, 23].map(formatOnboardingHour)).toEqual(['12 AM', '7 AM', '12 PM', '6 PM', '11 PM']);
  });
});
