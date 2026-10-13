// ==========================================
// WORKOUT DROP AUTHORING: validation + construction
// Shared by the web form (demo mode), POST /api/v1/drops and mobile clients.
// ==========================================
import type { Exercise, WorkoutDrop } from './index';

export const VIBE_TAGS = ['PHONK BEAST', 'LO-FI GLOW', 'ANIME PROTAGONIST', 'HARDSTYLE'] as const;
export type VibeTag = (typeof VIBE_TAGS)[number];

export const DROP_CATEGORIES = ['STRENGTH', 'HIIT', 'POSTURE_RESET', 'CARDIO_SNACK'] as const satisfies readonly WorkoutDrop['category'][];
export type DropCategory = (typeof DROP_CATEGORIES)[number];

export const DROP_LIMITS = {
  titleMin: 3,
  titleMax: 60,
  durationMin: 3,
  durationMax: 60,
  multiplierMin: 1,
  multiplierMax: 3,
} as const;

/** Raw form values (strings, as typed into inputs). */
export interface DropDraft {
  title: string;
  vibe: string;
  category: string;
  duration: string;
  multiplier: string;
}

/** A validated, normalised drop definition. Also the POST /api/v1/drops request body. */
export interface ValidDrop {
  title: string;
  vibe: VibeTag;
  category: DropCategory;
  duration: number;
  multiplier: number;
}

export type DropErrors = Partial<Record<keyof DropDraft, string>>;

export type DropValidationResult = { ok: true; value: ValidDrop } | { ok: false; errors: DropErrors };

export function validateDropDraft(d: DropDraft): DropValidationResult {
  const errors: DropErrors = {};
  const title = d.title.trim().replace(/\s+/g, ' ');
  if (!title) errors.title = 'Give your routine a title.';
  else if (title.length < DROP_LIMITS.titleMin) errors.title = `Title must be at least ${DROP_LIMITS.titleMin} characters.`;
  else if (title.length > DROP_LIMITS.titleMax) errors.title = `Title must be ${DROP_LIMITS.titleMax} characters or fewer.`;

  if (!(VIBE_TAGS as readonly string[]).includes(d.vibe)) errors.vibe = 'Pick a vibe tag.';
  if (!(DROP_CATEGORIES as readonly string[]).includes(d.category)) errors.category = 'Pick a category.';

  const duration = Number(d.duration);
  if (d.duration.trim() === '' || !Number.isInteger(duration) || duration < DROP_LIMITS.durationMin || duration > DROP_LIMITS.durationMax) {
    errors.duration = `Enter whole minutes between ${DROP_LIMITS.durationMin} and ${DROP_LIMITS.durationMax}.`;
  }

  const multiplier = Number(d.multiplier);
  if (d.multiplier.trim() === '' || !Number.isFinite(multiplier) || multiplier < DROP_LIMITS.multiplierMin || multiplier > DROP_LIMITS.multiplierMax) {
    errors.multiplier = `Enter a multiplier from ${DROP_LIMITS.multiplierMin.toFixed(1)} to ${DROP_LIMITS.multiplierMax.toFixed(1)}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      vibe: d.vibe as VibeTag,
      category: d.category as DropCategory,
      duration,
      multiplier: Math.round(multiplier * 10) / 10,
    },
  };
}

const DROP_INPUT_KEYS = new Set(['title', 'vibe', 'category', 'duration', 'multiplier']);

/**
 * Validates an untrusted JSON body for POST /api/v1/drops (a `CreateDropRequest`).
 * Numbers must be JSON numbers; unknown keys are rejected. Never throws.
 */
export function validateDropInput(input: unknown): DropValidationResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { title: 'Body must be a JSON object.' } };
  }
  const o = input as Record<string, unknown>;
  const unknownKey = Object.keys(o).find((k) => !DROP_INPUT_KEYS.has(k));
  if (unknownKey !== undefined) {
    return { ok: false, errors: { title: `Unknown field: ${unknownKey.slice(0, 40)}` } };
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  return validateDropDraft({
    title: str(o.title),
    vibe: str(o.vibe),
    category: str(o.category),
    duration: num(o.duration),
    multiplier: num(o.multiplier),
  });
}

/** Random, URL-safe id like `drop_lx2k3_9f1c2ab0` (matches the DB id CHECK). */
export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export interface DropCreator {
  id: string;
  username: string;
  handle: string;
  avatarUrl: string;
}

/** Derives a full WorkoutDrop from a validated definition (same rules on every platform). */
export function buildWorkoutDrop(input: ValidDrop, creator: DropCreator, id: string = makeId('drop')): WorkoutDrop {
  const exercises: Exercise[] = [
    {
      id: `${id}_ex1`,
      name: 'Main Movement',
      targetMuscle: 'Full Chain',
      repsOrSeconds: '4 sets x 12 reps',
      tips: 'Controlled tempo with focus on explosive contraction.',
    },
    {
      id: `${id}_ex2`,
      name: 'Core Compression Burnout',
      targetMuscle: 'Midsection',
      repsOrSeconds: '3 sets x 45 seconds',
      tips: 'Keep lower back stabilized.',
    },
  ];
  return {
    id,
    title: input.title,
    tagline: `Curated routine with ${input.vibe} cadence`,
    creatorId: creator.id,
    creatorName: creator.username,
    creatorHandle: creator.handle,
    creatorAvatar: creator.avatarUrl,
    creatorBadge: 'Verified Creator',
    vibeTag: input.vibe,
    durationMinutes: input.duration,
    caloriesBurnEstimate: Math.round(input.duration * 11),
    auraMultiplier: input.multiplier,
    xpPoints: Math.round(input.duration * 25),
    difficulty: 'BEAST',
    category: input.category,
    coverGradient: ['#7C3AED', '#3B82F6'],
    likesCount: 0,
    completionsCount: 0,
    exercises,
  };
}
