'use client';

import { useCallback, useMemo } from 'react';
import {
  ADMIN_USER,
  CREATOR_USER,
  INITIAL_QUESTS,
  INITIAL_USER,
  INITIAL_WORKOUT_DROPS,
  calculateAuraGain,
  getRankFromAura,
  hasPermission,
  type HunterRank,
  type UserPermission,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { LEGACY_KEYS, STORAGE_KEYS } from '@/lib/storage';
import { isQuestArray, isUserProfile, isUserRole, isWorkoutDropArray } from '@/lib/validators';
import { makeId, type ValidDrop } from '@/lib/drops';
import { usePersistentState } from './usePersistentState';

export type ActionResult =
  | { ok: true; auraEarned?: number; rankUp?: HunterRank; message: string }
  | { ok: false; message: string };

const MAX_STAT = 100;
const bump = (v: number, by: number) => Math.min(MAX_STAT, v + by);

function applyAura(prev: UserProfile, aura: number, extra?: Partial<UserProfile>): UserProfile {
  const auraPoints = prev.auraPoints + aura;
  return {
    ...prev,
    ...extra,
    auraPoints,
    rank: getRankFromAura(auraPoints).rank,
    weeklyAuraGained: prev.weeklyAuraGained + aura,
  };
}

/**
 * All game state + actions. Every profile (member, creator, admin) is
 * persisted independently. Actions validate permissions and return a result
 * instead of producing side effects, so the UI decides on toasts / sounds.
 */
export function useAuraFitState() {
  const [activeRole, setActiveRole, roleHydrated] = usePersistentState<UserRole>(STORAGE_KEYS.role, 'MEMBER', isUserRole);
  const [member, setMember, h1] = usePersistentState(STORAGE_KEYS.member, INITIAL_USER, isUserProfile, LEGACY_KEYS.member);
  const [creator, setCreator, h2] = usePersistentState(STORAGE_KEYS.creator, CREATOR_USER, isUserProfile);
  const [admin, setAdmin, h3] = usePersistentState(STORAGE_KEYS.admin, ADMIN_USER, isUserProfile);
  const [quests, setQuests, h4] = usePersistentState(STORAGE_KEYS.quests, INITIAL_QUESTS, isQuestArray, LEGACY_KEYS.quests);
  const [drops, setDrops, h5] = usePersistentState(STORAGE_KEYS.drops, INITIAL_WORKOUT_DROPS, isWorkoutDropArray, LEGACY_KEYS.drops);

  const hydrated = roleHydrated && h1 && h2 && h3 && h4 && h5;

  const activeUser = activeRole === 'MEMBER' ? member : activeRole === 'CREATOR' ? creator : admin;
  const setActiveUser = activeRole === 'MEMBER' ? setMember : activeRole === 'CREATOR' ? setCreator : setAdmin;

  const can = useCallback((p: UserPermission) => hasPermission(activeRole, p), [activeRole]);

  const rankInfo = useMemo(() => getRankFromAura(activeUser.auraPoints), [activeUser.auraPoints]);

  const completeQuest = useCallback(
    (questId: string): ActionResult => {
      if (!hasPermission(activeRole, 'DO_QUESTS')) {
        return { ok: false, message: 'Your role cannot log quests.' };
      }
      const quest = quests.find((q) => q.id === questId);
      if (!quest) return { ok: false, message: 'Quest not found.' };
      if (quest.completed) return { ok: false, message: 'Quest already claimed.' };

      const auraEarned = calculateAuraGain(quest.auraReward, activeUser.streakDays);
      const oldRank = getRankFromAura(activeUser.auraPoints).rank;
      const newRank = getRankFromAura(activeUser.auraPoints + auraEarned).rank;
      const { stat, amount } = quest.statReward;

      setQuests((prev) =>
        prev.map((q) => (q.id === questId ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q)),
      );
      setActiveUser((prev) =>
        applyAura(prev, auraEarned, {
          attributes: { ...prev.attributes, [stat]: bump(prev.attributes[stat] ?? 50, amount) },
          totalWorkouts: prev.totalWorkouts + 1,
        }),
      );

      return {
        ok: true,
        auraEarned,
        rankUp: newRank !== oldRank ? newRank : undefined,
        message: `+${auraEarned} Aura and +${amount} ${stat.toUpperCase()} earned!`,
      };
    },
    [activeRole, activeUser.auraPoints, activeUser.streakDays, quests, setActiveUser, setQuests],
  );

  const finishWorkout = useCallback(
    (drop: WorkoutDrop): ActionResult => {
      if (!hasPermission(activeRole, 'START_WORKOUT')) {
        return { ok: false, message: 'Your role cannot log workouts.' };
      }
      const auraEarned = calculateAuraGain(drop.xpPoints, activeUser.streakDays, drop.auraMultiplier);
      const oldRank = getRankFromAura(activeUser.auraPoints).rank;
      const newRank = getRankFromAura(activeUser.auraPoints + auraEarned).rank;

      setActiveUser((prev) =>
        applyAura(prev, auraEarned, {
          totalWorkouts: prev.totalWorkouts + 1,
          attributes: {
            ...prev.attributes,
            str: bump(prev.attributes.str, 4),
            agi: bump(prev.attributes.agi, 4),
            end: bump(prev.attributes.end, 3),
          },
        }),
      );
      setDrops((prev) => prev.map((d) => (d.id === drop.id ? { ...d, completionsCount: d.completionsCount + 1 } : d)));

      return {
        ok: true,
        auraEarned,
        rankUp: newRank !== oldRank ? newRank : undefined,
        message: `Workout conquered! +${auraEarned} Aura claimed.`,
      };
    },
    [activeRole, activeUser.auraPoints, activeUser.streakDays, setActiveUser, setDrops],
  );

  const publishDrop = useCallback(
    (input: ValidDrop): ActionResult => {
      if (!hasPermission(activeRole, 'PUBLISH_WORKOUT_DROP')) {
        return { ok: false, message: 'Creator or Admin permissions required.' };
      }
      const drop: WorkoutDrop = {
        id: makeId('drop'),
        title: input.title,
        tagline: `Curated routine with ${input.vibe} cadence`,
        creatorId: activeUser.id,
        creatorName: activeUser.username,
        creatorHandle: activeUser.handle,
        creatorAvatar: activeUser.avatarUrl,
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
        exercises: [
          {
            id: makeId('ex'),
            name: 'Main Movement',
            targetMuscle: 'Full Chain',
            repsOrSeconds: '4 sets x 12 reps',
            tips: 'Controlled tempo with focus on explosive contraction.',
          },
          {
            id: makeId('ex'),
            name: 'Core Compression Burnout',
            targetMuscle: 'Midsection',
            repsOrSeconds: '3 sets x 45 seconds',
            tips: 'Keep lower back stabilized.',
          },
        ],
      };
      setDrops((prev) => [drop, ...prev]);
      return { ok: true, message: `"${drop.title}" is live for all Hunters!` };
    },
    [activeRole, activeUser, setDrops],
  );

  return {
    hydrated,
    activeRole,
    setActiveRole,
    activeUser,
    rankInfo,
    quests,
    drops,
    can,
    completeQuest,
    finishWorkout,
    publishDrop,
  };
}

export type AuraFitState = ReturnType<typeof useAuraFitState>;
