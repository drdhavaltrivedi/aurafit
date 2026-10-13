import type { DropCategory } from '@aurafit/shared';

// Validation and construction live in @aurafit/shared so the API route,
// demo mode and the mobile app all apply the same rules.
export {
  VIBE_TAGS,
  DROP_CATEGORIES,
  DROP_LIMITS,
  validateDropDraft,
  validateDropInput,
  buildWorkoutDrop,
  makeId,
  type VibeTag,
  type DropCategory,
  type DropDraft,
  type DropErrors,
  type ValidDrop,
} from '@aurafit/shared';

export const CATEGORY_LABELS: Record<DropCategory, string> = {
  STRENGTH: 'Strength',
  HIIT: 'HIIT',
  POSTURE_RESET: 'Posture reset',
  CARDIO_SNACK: 'Cardio snack',
};

/** Seconds per interval set in the workout runner. */
export const SET_SECONDS = 45;
