// ==========================================
// CREATOR TOOLS — shared contract
// Implemented by apps/web/src/app/api/v1/{creator,creators,drops/[dropId],me/following}/** on top of
// supabase/migrations/20261014130000_creator_tools.sql; consumed by the web Creator Studio, /c/[handle]
// and the Expo app (Creator dashboard, drop editor, creator profile).
//
// Rules (validated here on client AND server; the DB CHECK constraints / triggers back them up):
//   * A drop has 1-30 exercises {name, targetMuscle, repsOrSeconds, tips}; ids are assigned by the server.
//   * Title 3-60, tagline 0-120, vibe tag 2-24 (A-Z 0-9 space & ' ! -, upper-cased), category, difficulty,
//     duration 3-60 min, calories 0-2000, aura multiplier 1.0-3.0 (one decimal), cover gradient from
//     COVER_GRADIENTS, optional publishAt (future, at most 60 days ahead; null = live now).
//   * XP is derived by the server from duration + difficulty (xpForDrop), never client-supplied.
//   * LIVE = publishAt null or <= now; SCHEDULED otherwise. Scheduled drops are visible only to their creator.
//   * Creators edit / delete only their own drops; official af_* system drops are never editable.
//     Edits keep likes / completions counters.
//   * Analytics are aggregates only (no athlete identities); the creator's own completions are excluded.
// ==========================================
import type { ApiErrorCode } from './api';
import type { DropCategory } from './drops';
import { DROP_CATEGORIES, VIBE_TAGS } from './drops';
import type { Exercise, UserRole, WorkoutDrop } from './index';
import type { ValidationResult } from './notifications';

export const DROP_DIFFICULTIES = ['NOVICE', 'HUNTER', 'BEAST', 'SHADOW'] as const satisfies readonly WorkoutDrop['difficulty'][];
export type DropDifficulty = (typeof DROP_DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<DropDifficulty, string> = {
  NOVICE: 'Novice',
  HUNTER: 'Hunter',
  BEAST: 'Beast',
  SHADOW: 'Shadow',
};

export const CATEGORY_NAMES: Record<DropCategory, string> = {
  STRENGTH: 'Strength',
  HIIT: 'HIIT',
  POSTURE_RESET: 'Posture & mobility',
  CARDIO_SNACK: 'Cardio snack',
};

export const CREATOR_DROP_LIMITS = {
  titleMin: 3,
  titleMax: 60,
  taglineMax: 120,
  vibeMin: 2,
  vibeMax: 24,
  exercisesMin: 1,
  exercisesMax: 30,
  exerciseNameMax: 60,
  targetMuscleMax: 40,
  repsMax: 40,
  tipsMax: 280,
  durationMin: 3,
  durationMax: 60,
  caloriesMin: 0,
  caloriesMax: 2000,
  multiplierMin: 1,
  multiplierMax: 3,
  publishMaxDays: 60,
} as const;

/** Curated brand cover gradients (the only values the server accepts). */
export const COVER_GRADIENTS = [
  { id: 'violet-blue', label: 'Violet surge', from: '#7C3AED', to: '#3B82F6' },
  { id: 'violet-pink', label: 'Phonk dusk', from: '#7C3AED', to: '#DB2777' },
  { id: 'cyan-blue', label: 'Lo-fi glow', from: '#06B6D4', to: '#3B82F6' },
  { id: 'amber-red', label: 'Redline', from: '#F59E0B', to: '#EF4444' },
  { id: 'emerald-cyan', label: 'Recovery', from: '#10B981', to: '#06B6D4' },
  { id: 'pink-orange', label: 'Sunset sprint', from: '#EC4899', to: '#F97316' },
  { id: 'indigo-violet', label: 'Shadow realm', from: '#4F46E5', to: '#9333EA' },
  { id: 'slate-violet', label: 'Monarch', from: '#334155', to: '#7C3AED' },
] as const;
export type CoverGradient = (typeof COVER_GRADIENTS)[number];

/** Suggested vibe tags (any tag matching VIBE_TAG_PATTERN is accepted). */
export const VIBE_SUGGESTIONS: readonly string[] = [...VIBE_TAGS, 'LEVEL ONE', 'IRON FOCUS', 'QUICK HIT', 'CALM MODE', 'REDLINE', 'FINAL BOSS'];
export const VIBE_TAG_PATTERN = /^[A-Z0-9](?:[A-Z0-9&'!-]| (?! ))*$/;

/** Official starter-library drops (owned by the system @aurafit profile): never editable. */
export const SYSTEM_DROP_PREFIX = 'af_';
export function isSystemDropId(id: string): boolean {
  return id.startsWith(SYSTEM_DROP_PREFIX);
}

export type CreatorDropStatus = 'LIVE' | 'SCHEDULED';

/** A drop as its creator sees it in the studio (includes scheduled drops). */
export interface CreatorDrop extends WorkoutDrop {
  status: CreatorDropStatus;
  /** ISO timestamp, or null when the drop went live on creation. */
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseInput {
  name: string;
  targetMuscle: string;
  repsOrSeconds: string;
  tips: string;
}

/** POST /api/v1/creator/drops and PATCH /api/v1/drops/{id} body. */
export interface DropEditorInput {
  title: string;
  tagline: string;
  vibeTag: string;
  category: DropCategory;
  difficulty: DropDifficulty;
  durationMinutes: number;
  caloriesBurnEstimate: number;
  auraMultiplier: number;
  coverGradient: [string, string];
  exercises: ExerciseInput[];
  /**
   * ISO timestamp in the future (<= 60 days), or null = live now. On PATCH, omit to keep the current
   * schedule; a LIVE drop cannot be moved back to scheduled.
   */
  publishAt?: string | null;
}

/** Validated + normalised editor input (publishAt: undefined = unchanged, null = live now). */
export interface ValidDropEditorInput extends Omit<DropEditorInput, 'publishAt'> {
  publishAt: string | null | undefined;
}

// ------------------------------------------
// Validation
// ------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

export function normalizeVibeTag(value: string): string {
  return collapse(value).toUpperCase();
}

export function findCoverGradient(pair: unknown): CoverGradient | null {
  if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
  const [a, b] = [pair[0].toUpperCase(), pair[1].toUpperCase()];
  return COVER_GRADIENTS.find((g) => g.from === a && g.to === b) ?? null;
}

/** Live when there is no schedule or it has passed. */
export function isDropLive(publishAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!publishAt) return true;
  const t = Date.parse(publishAt);
  return Number.isNaN(t) || t <= now.getTime();
}

export function dropStatus(publishAt: string | null | undefined, now: Date = new Date()): CreatorDropStatus {
  return isDropLive(publishAt, now) ? 'LIVE' : 'SCHEDULED';
}

/** Error message for a publishAt value, or null when it is valid (null/undefined are always valid). */
export function publishAtError(value: unknown, now: Date = new Date()): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40) return 'Pick a valid date and time.';
  const t = Date.parse(value);
  if (Number.isNaN(t)) return 'Pick a valid date and time.';
  if (t <= now.getTime()) return 'Scheduled time must be in the future.';
  if (t > now.getTime() + CREATOR_DROP_LIMITS.publishMaxDays * 86_400_000) {
    return `You can schedule at most ${CREATOR_DROP_LIMITS.publishMaxDays} days ahead.`;
  }
  return null;
}

function textError(value: unknown, label: string, min: number, max: number): string | null {
  if (typeof value !== 'string') return `${label} is required.`;
  const n = collapse(value).length;
  if (n < min) return min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  if (n > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

function intError(value: unknown, label: string, min: number, max: number, unit = ''): string | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? null
    : `${label} must be a whole number from ${min} to ${max}${unit}.`;
}

const EXERCISE_KEYS = ['name', 'targetMuscle', 'repsOrSeconds', 'tips'] as const;
const L = CREATOR_DROP_LIMITS;

/**
 * Validates + normalises an editor body (create, or PATCH with `partialPublish` = true so a missing
 * publishAt means "unchanged"). Field errors use keys like `title`, `exercises`, `exercises.2.name`.
 * Unknown keys are ignored. Never throws.
 */
export function validateDropEditorInput(
  input: unknown,
  { now = new Date(), patch = false }: { now?: Date; patch?: boolean } = {},
): ValidationResult<ValidDropEditorInput> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const e: Record<string, string> = {};
  const set = (k: string, msg: string | null) => {
    if (msg) e[k] = msg;
  };

  set('title', textError(input.title, 'Title', L.titleMin, L.titleMax));
  if (input.tagline !== undefined && input.tagline !== null) set('tagline', textError(input.tagline, 'Tagline', 0, L.taglineMax));
  const vibeErr = textError(input.vibeTag, 'Vibe tag', L.vibeMin, L.vibeMax);
  if (vibeErr) e.vibeTag = vibeErr;
  else if (!VIBE_TAG_PATTERN.test(normalizeVibeTag(input.vibeTag as string))) e.vibeTag = "Use letters, numbers, spaces and & ' ! -.";
  if (!(DROP_CATEGORIES as readonly unknown[]).includes(input.category)) e.category = 'Pick a category.';
  if (!(DROP_DIFFICULTIES as readonly unknown[]).includes(input.difficulty)) e.difficulty = 'Pick a difficulty.';
  set('durationMinutes', intError(input.durationMinutes, 'Duration', L.durationMin, L.durationMax, ' minutes'));
  set('caloriesBurnEstimate', intError(input.caloriesBurnEstimate, 'Calories', L.caloriesMin, L.caloriesMax));
  const m = input.auraMultiplier;
  if (typeof m !== 'number' || !Number.isFinite(m) || m < L.multiplierMin || m > L.multiplierMax) {
    e.auraMultiplier = `Aura multiplier must be from ${L.multiplierMin.toFixed(1)} to ${L.multiplierMax.toFixed(1)}.`;
  }
  const cover = findCoverGradient(input.coverGradient);
  if (!cover) e.coverGradient = 'Pick one of the cover gradients.';

  const exercises: ExerciseInput[] = [];
  if (!Array.isArray(input.exercises)) e.exercises = 'Add at least one exercise.';
  else if (input.exercises.length < L.exercisesMin) e.exercises = 'Add at least one exercise.';
  else if (input.exercises.length > L.exercisesMax) e.exercises = `A drop can have at most ${L.exercisesMax} exercises.`;
  else {
    input.exercises.forEach((raw, i) => {
      if (!isObject(raw)) {
        e[`exercises.${i}`] = 'Invalid exercise.';
        return;
      }
      set(`exercises.${i}.name`, textError(raw.name, 'Exercise name', 2, L.exerciseNameMax));
      set(`exercises.${i}.targetMuscle`, textError(raw.targetMuscle, 'Target muscle', 2, L.targetMuscleMax));
      set(`exercises.${i}.repsOrSeconds`, textError(raw.repsOrSeconds, 'Reps or time', 1, L.repsMax));
      if (raw.tips !== undefined && raw.tips !== null) set(`exercises.${i}.tips`, textError(raw.tips, 'Tips', 0, L.tipsMax));
      const out = {} as ExerciseInput;
      for (const k of EXERCISE_KEYS) out[k] = typeof raw[k] === 'string' ? collapse(raw[k] as string) : '';
      exercises.push(out);
    });
  }

  let publishAt: string | null | undefined;
  if (input.publishAt === undefined) publishAt = patch ? undefined : null;
  else {
    const err = publishAtError(input.publishAt, now);
    if (err) e.publishAt = err;
    else publishAt = input.publishAt === null ? null : new Date(Date.parse(input.publishAt as string)).toISOString();
  }

  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return {
    ok: true,
    value: {
      title: collapse(input.title as string),
      tagline: typeof input.tagline === 'string' ? collapse(input.tagline) : '',
      vibeTag: normalizeVibeTag(input.vibeTag as string),
      category: input.category as DropCategory,
      difficulty: input.difficulty as DropDifficulty,
      durationMinutes: input.durationMinutes as number,
      caloriesBurnEstimate: input.caloriesBurnEstimate as number,
      auraMultiplier: Math.round((m as number) * 10) / 10,
      coverGradient: [cover!.from, cover!.to],
      exercises,
      publishAt,
    },
  };
}

const DIFFICULTY_XP_FACTOR: Record<DropDifficulty, number> = { NOVICE: 1, HUNTER: 1.2, BEAST: 1.4, SHADOW: 1.6 };

/**
 * Server-derived XP (the base reward of a completion): 50 + duration x 10 x difficulty factor.
 * Max 1010 (60 min SHADOW), so even x3.0 and the +50% streak bonus stay under MAX_AURA_PER_ACTION.
 */
export function xpForDrop(durationMinutes: number, difficulty: DropDifficulty): number {
  const d = Math.min(L.durationMax, Math.max(0, Math.floor(durationMinutes) || 0));
  return Math.round(50 + d * 10 * (DIFFICULTY_XP_FACTOR[difficulty] ?? 1));
}

/** Server-assigned exercise ids: `${dropId}_ex1`, `${dropId}_ex2`, ... (match the DB id pattern). */
export function toExercises(dropId: string, input: ExerciseInput[]): Exercise[] {
  return input.map((x, i) => ({ id: `${dropId}_ex${i + 1}`, ...x }));
}

/** Blank editor state helpers (clients). */
export function emptyExercise(): ExerciseInput {
  return { name: '', targetMuscle: '', repsOrSeconds: '', tips: '' };
}

export function dropToEditorInput(drop: WorkoutDrop & { publishAt?: string | null }): DropEditorInput {
  return {
    title: drop.title,
    tagline: drop.tagline,
    vibeTag: drop.vibeTag,
    category: drop.category,
    difficulty: drop.difficulty,
    durationMinutes: drop.durationMinutes,
    caloriesBurnEstimate: drop.caloriesBurnEstimate,
    auraMultiplier: drop.auraMultiplier,
    coverGradient: findCoverGradient(drop.coverGradient) ? drop.coverGradient : [COVER_GRADIENTS[0].from, COVER_GRADIENTS[0].to],
    exercises: drop.exercises.map((x) => ({ name: x.name, targetMuscle: x.targetMuscle, repsOrSeconds: x.repsOrSeconds, tips: x.tips })),
    publishAt: drop.publishAt ?? null,
  };
}

/** Moves item `from` to `to` (clamped); returns a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

// ------------------------------------------
// Follows + public creator profile
// ------------------------------------------

export interface CreatorSummary {
  id: string;
  username: string;
  handle: string;
  /** '' when none. */
  avatarUrl: string;
  /** Profile title, e.g. "Official AuraFit programming". */
  title: string;
  role: Extract<UserRole, 'CREATOR' | 'ADMIN'>;
  /** True for the official system profile (@aurafit). */
  official: boolean;
}

/** GET /api/v1/creators/{handle} (public; `isFollowing` only when signed in). */
export interface CreatorProfileResponse {
  creator: CreatorSummary & {
    bio: string;
    /** Badge shown on drop cards (the most common creator_badge of their drops). */
    badge: string;
    followerCount: number;
    liveDropCount: number;
    totalCompletions: number;
    totalLikes: number;
  };
  /** Live drops, newest first. */
  drops: WorkoutDrop[];
  /** null when the viewer is signed out. */
  isFollowing: boolean | null;
  /** True when the viewer is this creator. */
  isSelf: boolean;
}

/** POST / DELETE /api/v1/creators/{handle}/follow */
export interface FollowResponse {
  following: boolean;
  followerCount: number;
}

export interface FollowedCreator extends CreatorSummary {
  followedAt: string;
}

/** GET /api/v1/me/following (newest first). */
export interface FollowingResponse {
  creators: FollowedCreator[];
}

// ------------------------------------------
// Analytics
// ------------------------------------------

export const ANALYTICS_RANGES = ['7d', '30d'] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
export const ANALYTICS_RANGE_DAYS: Record<AnalyticsRange, number> = { '7d': 7, '30d': 30 };

export function parseAnalyticsRange(raw: string | null | undefined): AnalyticsRange | null {
  if (raw === null || raw === undefined || raw === '') return '7d';
  return (ANALYTICS_RANGES as readonly string[]).includes(raw) ? (raw as AnalyticsRange) : null;
}

export interface CreatorAnalyticsTotals {
  followers: number;
  liveDrops: number;
  scheduledDrops: number;
  /** Completions by other athletes in the range. */
  completions: number;
  uniqueAthletes: number;
  /** Aura athletes earned from your drops in the range. */
  auraAwarded: number;
}

export interface CreatorAnalyticsDrop {
  dropId: string;
  title: string;
  status: CreatorDropStatus;
  publishAt: string | null;
  completions: number;
  uniqueAthletes: number;
  /** UTC date (YYYY-MM-DD) of the most recent completion in the range, or null. */
  lastCompletedOn: string | null;
  allTimeCompletions: number;
}

export interface CreatorAnalyticsPoint {
  /** UTC date YYYY-MM-DD. */
  date: string;
  completions: number;
}

/** GET /api/v1/creator/analytics?range=7d|30d */
export interface CreatorAnalyticsResponse {
  range: AnalyticsRange;
  /** First and last UTC day of the window (inclusive). */
  from: string;
  to: string;
  totals: CreatorAnalyticsTotals;
  drops: CreatorAnalyticsDrop[];
  /** One point per day, oldest first, zero-filled. */
  series: CreatorAnalyticsPoint[];
}

/** GET /api/v1/creator/drops */
export interface CreatorDropsResponse {
  drops: CreatorDrop[];
}

/** POST /api/v1/creator/drops → 201, PATCH /api/v1/drops/{id} → 200 */
export interface CreatorDropResponse {
  drop: CreatorDrop;
}

export type CreatorErrorCode =
  | 'NOT_DROP_OWNER' // 403: the drop belongs to someone else (or is an official af_* drop)
  | 'ALREADY_LIVE' // 409: a live drop cannot be rescheduled
  | 'CREATOR_NOT_FOUND' // 404: no creator with that handle
  | 'CANNOT_FOLLOW_SELF'; // 400

export interface CreatorApiError {
  error: string;
  code: ApiErrorCode | CreatorErrorCode;
  details?: string[];
  fieldErrors?: Record<string, string>;
}

export const CREATOR_ROUTES = {
  /** GET (auth, PUBLISH_WORKOUT_DROP) → CreatorDropsResponse; POST DropEditorInput → 201 CreatorDropResponse */
  drops: '/api/v1/creator/drops',
  /**
   * PATCH (auth, PUBLISH_WORKOUT_DROP, owner) DropEditorInput → CreatorDropResponse
   *   | 400 VALIDATION_FAILED | 403 NOT_DROP_OWNER | 404 | 409 ALREADY_LIVE
   * DELETE (auth, owner) → 204 | 403 NOT_DROP_OWNER | 404
   */
  drop: (id: string) => `/api/v1/drops/${encodeURIComponent(id)}`,
  /** GET (auth, VIEW_CREATOR_ANALYTICS) ?range=7d|30d → CreatorAnalyticsResponse */
  analytics: (range: AnalyticsRange = '7d') => `/api/v1/creator/analytics?range=${range}`,
  /** GET (public) → CreatorProfileResponse | 404 CREATOR_NOT_FOUND */
  creator: (handle: string) => `/api/v1/creators/${encodeURIComponent(handle.replace(/^@/, ''))}`,
  /** POST / DELETE (auth) → FollowResponse | 400 CANNOT_FOLLOW_SELF | 404 CREATOR_NOT_FOUND */
  follow: (handle: string) => `/api/v1/creators/${encodeURIComponent(handle.replace(/^@/, ''))}/follow`,
  /** GET (auth) → FollowingResponse */
  following: '/api/v1/me/following',
} as const;

/** Web path of a public creator page. */
export function creatorProfilePath(handle: string): string {
  return `/c/${encodeURIComponent(handle.replace(/^@/, ''))}`;
}

// ------------------------------------------
// Demo / sample analytics (clearly labelled sample data in the clients)
// ------------------------------------------

/** UTC YYYY-MM-DD for `d`. */
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic SAMPLE analytics for demo mode, derived from the given drops. Never use for real data.
 */
export function sampleCreatorAnalytics(drops: readonly CreatorDrop[], range: AnalyticsRange, now: Date = new Date()): CreatorAnalyticsResponse {
  const days = ANALYTICS_RANGE_DAYS[range];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const series: CreatorAnalyticsPoint[] = Array.from({ length: days }, (_, i) => {
    const t = today - (days - 1 - i) * 86_400_000;
    const wave = Math.round(18 + 10 * Math.sin(i / 1.7) + ((i * 7) % 5) * 2);
    return { date: day(new Date(t)), completions: drops.length === 0 ? 0 : Math.max(0, wave) };
  });
  const completions = series.reduce((s, p) => s + p.completions, 0);
  const live = drops.filter((d) => d.status === 'LIVE');
  const weights = live.map((_, i) => live.length - i);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  let assigned = 0;
  const perDrop = drops.map((d) => {
    const idx = live.indexOf(d);
    let c = 0;
    if (idx >= 0) {
      c = idx === live.length - 1 ? completions - assigned : Math.floor((completions * weights[idx]) / weightSum);
      assigned += c;
    }
    return {
      dropId: d.id,
      title: d.title,
      status: d.status,
      publishAt: d.publishAt,
      completions: c,
      uniqueAthletes: Math.round(c * 0.7),
      lastCompletedOn: c > 0 ? day(new Date(today)) : null,
      allTimeCompletions: d.completionsCount,
    };
  });
  return {
    range,
    from: series[0]?.date ?? day(new Date(today)),
    to: day(new Date(today)),
    totals: {
      followers: drops.length === 0 ? 0 : 320,
      liveDrops: live.length,
      scheduledDrops: drops.length - live.length,
      completions,
      uniqueAthletes: Math.round(completions * 0.62),
      auraAwarded: completions * 310,
    },
    drops: perDrop.sort((a, b) => b.completions - a.completions),
    series,
  };
}

/** Builds a CreatorDrop locally (demo mode). */
export function buildCreatorDrop(
  input: ValidDropEditorInput,
  creator: { id: string; username: string; handle: string; avatarUrl: string },
  id: string,
  existing?: CreatorDrop,
  now: Date = new Date(),
): CreatorDrop {
  const publishAt = input.publishAt === undefined ? existing?.publishAt ?? null : input.publishAt;
  const iso = now.toISOString();
  return {
    id,
    title: input.title,
    tagline: input.tagline,
    creatorId: creator.id,
    creatorName: creator.username,
    creatorHandle: creator.handle,
    creatorAvatar: creator.avatarUrl,
    creatorBadge: existing?.creatorBadge ?? 'Verified Creator',
    vibeTag: input.vibeTag,
    durationMinutes: input.durationMinutes,
    caloriesBurnEstimate: input.caloriesBurnEstimate,
    auraMultiplier: input.auraMultiplier,
    xpPoints: xpForDrop(input.durationMinutes, input.difficulty),
    difficulty: input.difficulty,
    category: input.category,
    coverGradient: input.coverGradient,
    exercises: toExercises(id, input.exercises),
    likesCount: existing?.likesCount ?? 0,
    completionsCount: existing?.completionsCount ?? 0,
    status: dropStatus(publishAt, now),
    publishAt,
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
}

/** Wraps a plain (live) WorkoutDrop as a CreatorDrop (demo seed data). */
export function asCreatorDrop(drop: WorkoutDrop, createdAt = '2026-10-01T00:00:00.000Z'): CreatorDrop {
  return { ...drop, status: 'LIVE', publishAt: null, createdAt, updatedAt: createdAt };
}
