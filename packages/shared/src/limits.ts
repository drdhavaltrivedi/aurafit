// ==========================================
// SERVER-ENFORCED LIMITS
// Mirrored by CHECK constraints / function guards in supabase/migrations.
// ==========================================

/**
 * Highest aura a single game action (quest or workout completion) may award.
 * The largest seeded reward (1500) with the highest seeded workout multiplier
 * (1.8x) and the max streak bonus (+50%) is 4050, so 5000 leaves headroom.
 * Mirrors `aura_earned BETWEEN 0 AND 5000` and the guards in public.complete_quest
 * / public.complete_workout.
 */
export const MAX_AURA_PER_ACTION = 5000;

/** @deprecated Use MAX_AURA_PER_ACTION (the /api/sync endpoint has been removed). */
export const MAX_AURA_PER_SYNC = MAX_AURA_PER_ACTION;
