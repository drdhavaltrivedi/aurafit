import type { WorkoutDrop } from '@aurafit/shared';

export const VIBE_TAGS = ['PHONK BEAST', 'LO-FI GLOW', 'ANIME PROTAGONIST', 'HARDSTYLE'] as const;
export type VibeTag = (typeof VIBE_TAGS)[number];

export const DROP_CATEGORIES = ['STRENGTH', 'HIIT', 'POSTURE_RESET', 'CARDIO_SNACK'] as const satisfies readonly WorkoutDrop['category'][];
export type DropCategory = (typeof DROP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DropCategory, string> = {
  STRENGTH: 'Strength',
  HIIT: 'HIIT',
  POSTURE_RESET: 'Posture reset',
  CARDIO_SNACK: 'Cardio snack',
};

export const DROP_LIMITS = {
  titleMin: 3,
  titleMax: 60,
  durationMin: 3,
  durationMax: 60,
  multiplierMin: 1,
  multiplierMax: 3,
} as const;

/** Seconds per interval set in the workout runner. */
export const SET_SECONDS = 45;

export interface DropDraft {
  title: string;
  vibe: string;
  category: string;
  duration: string;
  multiplier: string;
}

export interface ValidDrop {
  title: string;
  vibe: VibeTag;
  category: DropCategory;
  duration: number;
  multiplier: number;
}

export type DropErrors = Partial<Record<keyof DropDraft, string>>;

export function validateDropDraft(d: DropDraft): { ok: true; value: ValidDrop } | { ok: false; errors: DropErrors } {
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

export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
