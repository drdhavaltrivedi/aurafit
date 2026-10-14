// ==========================================
// ONBOARDING: fitness goal / level, PATCH /api/v1/me contract, first-workout recommendation.
// Shared by the web onboarding route, PATCH /api/v1/me and the Expo onboarding flow.
// Enum values mirror public.fitness_goal_enum / public.fitness_level_enum
// (supabase/migrations/20261014100000_onboarding.sql).
// ==========================================
import type { UserProfile, WorkoutDrop } from './index';

export const FITNESS_GOALS = ['BUILD_STRENGTH', 'LOSE_WEIGHT', 'GET_FIT', 'BUILD_HABIT', 'MOBILITY'] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const FITNESS_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const isFitnessGoal = (v: unknown): v is FitnessGoal =>
  typeof v === 'string' && (FITNESS_GOALS as readonly string[]).includes(v);
export const isFitnessLevel = (v: unknown): v is FitnessLevel =>
  typeof v === 'string' && (FITNESS_LEVELS as readonly string[]).includes(v);

/** Copy for goal cards (clients map `id` to their own Lucide icon). */
export const FITNESS_GOAL_META: Record<FitnessGoal, { label: string; description: string }> = {
  BUILD_STRENGTH: { label: 'Build strength', description: 'Get stronger with bodyweight power sessions.' },
  LOSE_WEIGHT: { label: 'Lose weight', description: 'Burn more with sweaty cardio and HIIT.' },
  GET_FIT: { label: 'Get fit overall', description: 'A balanced mix of strength and cardio.' },
  BUILD_HABIT: { label: 'Build a habit', description: 'Short daily sessions you can actually keep.' },
  MOBILITY: { label: 'Move better', description: 'Mobility and posture work to loosen up.' },
};

export const FITNESS_LEVEL_META: Record<FitnessLevel, { label: string; description: string }> = {
  BEGINNER: { label: 'Beginner', description: 'New to training, or coming back after a long break.' },
  INTERMEDIATE: { label: 'Intermediate', description: 'I train now and then and know the basics.' },
  ADVANCED: { label: 'Advanced', description: 'I train most weeks and want a real challenge.' },
};

/** Flow order shared by web and mobile; `done` is the finish screen. */
export const ONBOARDING_STEPS = ['welcome', 'goal', 'level', 'reminder', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
/** Steps counted by the progress indicator ("Step n of 4"). */
export const ONBOARDING_PROGRESS_STEPS = 4;

/** Mirrors `profiles.username VARCHAR(50)` + `char_length(btrim(username)) > 0`. */
export const PROFILE_USERNAME_MAX = 50;

/**
 * PATCH /api/v1/me body (Content-Type: application/json). Every field is optional, but at
 * least one must be present. Unknown keys are rejected (400 VALIDATION_FAILED).
 *  - `completeOnboarding: true` marks onboarding complete (server sets `onboarded_at` once;
 *    re-sending it is a no-op). `false` is not accepted.
 */
export interface UpdateMeRequest {
  fitnessGoal?: FitnessGoal;
  fitnessLevel?: FitnessLevel;
  username?: string;
  completeOnboarding?: true;
}

/** PATCH /api/v1/me → 200 */
export interface UpdateMeResponse {
  profile: UserProfile;
}

export type UpdateMeValidation =
  | { ok: true; value: UpdateMeRequest }
  | { ok: false; fieldErrors: Record<string, string> };

const UPDATE_ME_KEYS = new Set(['fitnessGoal', 'fitnessLevel', 'username', 'completeOnboarding']);

/** Trims and collapses internal whitespace; returns an error message or the clean name. */
export function normalizeUsername(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'Enter a display name.' };
  if (value.length > PROFILE_USERNAME_MAX) return { ok: false, error: `Keep it to ${PROFILE_USERNAME_MAX} characters or fewer.` };
  // Control characters render badly everywhere the name is shown.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return { ok: false, error: 'Display name contains invalid characters.' };
  return { ok: true, value };
}

/** Validates an untrusted PATCH /api/v1/me body. Never throws. */
export function validateUpdateMe(input: unknown): UpdateMeValidation {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  }
  const o = input as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  for (const k of Object.keys(o)) {
    if (!UPDATE_ME_KEYS.has(k)) fieldErrors[k.slice(0, 40)] = `Unknown field: ${k.slice(0, 40)}`;
  }
  const value: UpdateMeRequest = {};
  if ('fitnessGoal' in o) {
    if (isFitnessGoal(o.fitnessGoal)) value.fitnessGoal = o.fitnessGoal;
    else fieldErrors.fitnessGoal = `fitnessGoal must be one of ${FITNESS_GOALS.join(', ')}.`;
  }
  if ('fitnessLevel' in o) {
    if (isFitnessLevel(o.fitnessLevel)) value.fitnessLevel = o.fitnessLevel;
    else fieldErrors.fitnessLevel = `fitnessLevel must be one of ${FITNESS_LEVELS.join(', ')}.`;
  }
  if ('username' in o) {
    if (typeof o.username !== 'string') fieldErrors.username = 'username must be a string.';
    else {
      const n = normalizeUsername(o.username);
      if (n.ok) value.username = n.value;
      else fieldErrors.username = n.error;
    }
  }
  if ('completeOnboarding' in o) {
    if (o.completeOnboarding === true) value.completeOnboarding = true;
    else fieldErrors.completeOnboarding = 'completeOnboarding must be true when present.';
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  if (Object.keys(value).length === 0) return { ok: false, fieldErrors: { body: 'Provide at least one field to update.' } };
  return { ok: true, value };
}

// ==========================================
// REMINDER STEP → push agent's notification settings endpoint
// ==========================================

/** Endpoint owned by the streak-saver push feature (may not be deployed yet). */
export const ONBOARDING_NOTIFICATION_SETTINGS_URL = '/api/v1/me/notification-settings';

/** PUT body for ONBOARDING_NOTIFICATION_SETTINGS_URL (see notifications.ts for the full contract). */
export interface OnboardingNotificationSettingsBody {
  /** IANA zone, e.g. "Europe/Berlin". */
  timezone: string;
  streakSaver: boolean;
  /** 0-23 local hour, or null for no daily reminder. */
  dailyReminderHour: number | null;
}

/** 404 / 501 mean "endpoint not deployed yet": onboarding logs and continues. */
export const isNonFatalSettingsStatus = (status: number): boolean => status === 404 || status === 501;

/** The device's IANA time zone, or "UTC" when the runtime cannot tell. */
export function onboardingTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

export function buildOnboardingNotificationSettings(
  reminderHour: number | null,
  timezone: string = onboardingTimeZone(),
  streakSaver = true,
): OnboardingNotificationSettingsBody {
  const hour =
    typeof reminderHour === 'number' && Number.isInteger(reminderHour) && reminderHour >= 0 && reminderHour <= 23
      ? reminderHour
      : null;
  return { timezone, streakSaver, dailyReminderHour: hour };
}

/** Hours offered by the reminder step (local time). */
export const ONBOARDING_REMINDER_HOURS = [7, 12, 18, 20] as const;
export const ONBOARDING_DEFAULT_REMINDER_HOUR = 18;

/** "6 PM" style label for an hour 0-23. */
export function formatOnboardingHour(hour: number): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

// ==========================================
// RECOMMENDED FIRST QUEST
// ==========================================

/** Official starter library (supabase/migrations/20261014090000_starter_library.sql). */
export const STARTER_DROP_IDS = [
  'af_first_quest_fullbody',
  'af_desk_reset_5',
  'af_hiit_ignite_15',
  'af_push_power_20',
  'af_leg_day_lite_18',
  'af_core_armor_10',
  'af_cardio_snack_7',
  'af_mobility_flow_12',
  'af_tabata_burn_16',
  'af_monarch_challenge_25',
] as const;
export type StarterDropId = (typeof STARTER_DROP_IDS)[number];

export const DEFAULT_FIRST_WORKOUT_ID: StarterDropId = 'af_first_quest_fullbody';

type Difficulty = WorkoutDrop['difficulty'];

/** Highest drop difficulty a level may be recommended. Beginners never get BEAST / SHADOW. */
export const MAX_DIFFICULTY_FOR_LEVEL: Record<FitnessLevel, Difficulty> = {
  BEGINNER: 'NOVICE',
  INTERMEDIATE: 'HUNTER',
  ADVANCED: 'SHADOW',
};
const DIFFICULTY_ORDER: readonly Difficulty[] = ['NOVICE', 'HUNTER', 'BEAST', 'SHADOW'];

export function isDifficultyAllowed(level: FitnessLevel, difficulty: Difficulty): boolean {
  const i = DIFFICULTY_ORDER.indexOf(difficulty);
  return i >= 0 && i <= DIFFICULTY_ORDER.indexOf(MAX_DIFFICULTY_FOR_LEVEL[level]);
}

/** Preference order per goal and level (first available, level-appropriate drop wins). */
export const FIRST_WORKOUT_PREFERENCES: Record<FitnessGoal, Record<FitnessLevel, readonly StarterDropId[]>> = {
  BUILD_STRENGTH: {
    BEGINNER: ['af_first_quest_fullbody', 'af_core_armor_10'],
    INTERMEDIATE: ['af_push_power_20', 'af_leg_day_lite_18', 'af_first_quest_fullbody'],
    ADVANCED: ['af_monarch_challenge_25', 'af_push_power_20', 'af_leg_day_lite_18'],
  },
  LOSE_WEIGHT: {
    BEGINNER: ['af_cardio_snack_7', 'af_first_quest_fullbody'],
    INTERMEDIATE: ['af_hiit_ignite_15', 'af_cardio_snack_7'],
    ADVANCED: ['af_tabata_burn_16', 'af_hiit_ignite_15'],
  },
  GET_FIT: {
    BEGINNER: ['af_first_quest_fullbody', 'af_cardio_snack_7'],
    INTERMEDIATE: ['af_hiit_ignite_15', 'af_leg_day_lite_18', 'af_first_quest_fullbody'],
    ADVANCED: ['af_tabata_burn_16', 'af_monarch_challenge_25', 'af_hiit_ignite_15'],
  },
  BUILD_HABIT: {
    BEGINNER: ['af_desk_reset_5', 'af_cardio_snack_7', 'af_first_quest_fullbody'],
    INTERMEDIATE: ['af_cardio_snack_7', 'af_core_armor_10', 'af_desk_reset_5'],
    ADVANCED: ['af_core_armor_10', 'af_hiit_ignite_15', 'af_cardio_snack_7'],
  },
  MOBILITY: {
    BEGINNER: ['af_mobility_flow_12', 'af_desk_reset_5'],
    INTERMEDIATE: ['af_mobility_flow_12', 'af_desk_reset_5'],
    ADVANCED: ['af_mobility_flow_12', 'af_desk_reset_5'],
  },
};

/**
 * Picks the first workout to suggest after onboarding.
 *
 * Walks the goal/level preference list and returns the first drop that exists in `drops`
 * and whose difficulty the level allows. Falls back to the official `af_` starter (default
 * first) and then to any level-appropriate drop. A missing goal/level counts as
 * GET_FIT / BEGINNER. Returns null only when no drop in `drops` is suitable.
 */
export function recommendFirstWorkout(
  goal: FitnessGoal | null | undefined,
  level: FitnessLevel | null | undefined,
  drops: ReadonlyArray<Pick<WorkoutDrop, 'id' | 'difficulty'>>,
): string | null {
  const g: FitnessGoal = isFitnessGoal(goal) ? goal : 'GET_FIT';
  const l: FitnessLevel = isFitnessLevel(level) ? level : 'BEGINNER';
  const byId = new Map(drops.map((d) => [d.id, d] as const));
  const ok = (id: string) => {
    const d = byId.get(id);
    return !!d && isDifficultyAllowed(l, d.difficulty);
  };
  const hit = FIRST_WORKOUT_PREFERENCES[g][l].find(ok);
  if (hit) return hit;
  if (ok(DEFAULT_FIRST_WORKOUT_ID)) return DEFAULT_FIRST_WORKOUT_ID;
  const official = STARTER_DROP_IDS.find(ok);
  if (official) return official;
  return drops.find((d) => isDifficultyAllowed(l, d.difficulty))?.id ?? null;
}
