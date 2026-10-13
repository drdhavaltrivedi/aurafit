import { getRankFromAura, type PlayerAttributes, type Quest, type UserProfile } from '@aurafit/shared';

/**
 * Pure client-side progress updates. Used directly in demo mode and as the
 * optimistic prediction in server mode (the server response then replaces it).
 * Mirrors public.complete_quest / public.complete_workout in schema.sql.
 */
const MAX_STAT = 100;
const bump = (v: number, by: number) => Math.min(MAX_STAT, Math.max(0, (v ?? 50) + by));

export function applyAura(prev: UserProfile, aura: number, extra?: Partial<UserProfile>): UserProfile {
  const auraPoints = prev.auraPoints + aura;
  return { ...prev, ...extra, auraPoints, rank: getRankFromAura(auraPoints).rank, weeklyAuraGained: prev.weeklyAuraGained + aura };
}

export function applyQuestCompletion(prev: UserProfile, stat: keyof PlayerAttributes, amount: number, aura: number): UserProfile {
  return applyAura(prev, aura, {
    attributes: { ...prev.attributes, [stat]: bump(prev.attributes[stat], amount) },
    totalWorkouts: prev.totalWorkouts + 1,
  });
}

export function applyWorkoutCompletion(prev: UserProfile, aura: number): UserProfile {
  return applyAura(prev, aura, {
    totalWorkouts: prev.totalWorkouts + 1,
    attributes: { ...prev.attributes, str: bump(prev.attributes.str, 4), agi: bump(prev.attributes.agi, 4), end: bump(prev.attributes.end, 3) },
  });
}

export const markQuestCompleted = (quests: Quest[], questId: string): Quest[] =>
  quests.map((q) => (q.id === questId ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q));
