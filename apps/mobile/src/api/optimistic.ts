/**
 * Pure optimistic-update helpers for server mode (unit-tested). The server response always wins;
 * these only make the UI feel instant and are rolled back on failure.
 */
import { calculateAuraGain, getRankFromAura, type UserProfile, type WorkoutDrop } from '@aurafit/shared';
import type { MeResponse } from './types';

function withAura(profile: UserProfile, earned: number): UserProfile {
  const auraPoints = profile.auraPoints + earned;
  return {
    ...profile,
    auraPoints,
    weeklyAuraGained: profile.weeklyAuraGained + earned,
    rank: getRankFromAura(auraPoints).rank,
  };
}

/** Returns the optimistic state, or null if the quest is unknown / already completed. */
export function optimisticCompleteQuest(me: MeResponse, questId: string): MeResponse | null {
  const quest = me.quests.find((q) => q.id === questId);
  if (!quest || quest.completed) return null;
  const earned = calculateAuraGain(quest.auraReward, me.profile.streakDays);
  const { stat, amount } = quest.statReward;
  const profile = withAura(me.profile, earned);
  return {
    profile: { ...profile, attributes: { ...profile.attributes, [stat]: profile.attributes[stat] + amount } },
    quests: me.quests.map((q) =>
      q.id === questId ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q
    ),
  };
}

export function optimisticCompleteWorkout(me: MeResponse, drop: WorkoutDrop): MeResponse {
  const earned = calculateAuraGain(drop.xpPoints, me.profile.streakDays, drop.auraMultiplier);
  const profile = withAura(me.profile, earned);
  return { ...me, profile: { ...profile, totalWorkouts: profile.totalWorkouts + 1 } };
}

/** Marks a quest completed without touching the profile (used when the server says 409 already completed). */
export function markQuestCompleted(me: MeResponse, questId: string): MeResponse {
  return {
    ...me,
    quests: me.quests.map((q) =>
      q.id === questId ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q
    ),
  };
}
