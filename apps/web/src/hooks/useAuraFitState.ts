'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_USER,
  CREATOR_USER,
  INITIAL_QUESTS,
  INITIAL_USER,
  INITIAL_WORKOUT_DROPS,
  buildWorkoutDrop,
  calculateAuraGain,
  getRankFromAura,
  hasPermission,
  type ApiErrorCode,
  type HunterRank,
  type Quest,
  type UserPermission,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
  type CreatorDrop,
} from '@aurafit/shared';
import { api } from '@/lib/api-client';
import type { ValidDrop } from '@/lib/drops';
import { applyQuestCompletion, applyWorkoutCompletion, markQuestCompleted } from '@/lib/progress';
import { LEGACY_KEYS, STORAGE_KEYS } from '@/lib/storage';
import { isQuestArray, isUserProfile, isUserRole, isWorkoutDropArray } from '@/lib/validators';
import { usePersistentState } from './usePersistentState';

export type ActionResult =
  | { ok: true; auraEarned?: number; rankUp?: HunterRank; message: string }
  | { ok: false; message: string; code?: ApiErrorCode | 'NETWORK_ERROR' };

export type DataMode = 'demo' | 'server';

/** Common surface of demo (localStorage) and server-backed (/api/v1) game state. */
export interface AuraFitState {
  mode: DataMode;
  hydrated: boolean;
  /** Server mode: why the initial load failed (null when fine). */
  loadError: string | null;
  reload: () => void;
  activeRole: UserRole;
  /** Demo only: switch persona. null in server mode (role comes from the profile). */
  setActiveRole: ((role: UserRole) => void) | null;
  activeUser: UserProfile;
  rankInfo: ReturnType<typeof getRankFromAura>;
  quests: Quest[];
  drops: WorkoutDrop[];
  can: (p: UserPermission) => boolean;
  completeQuest: (questId: string) => Promise<ActionResult>;
  finishWorkout: (drop: WorkoutDrop) => Promise<ActionResult>;
  publishDrop: (input: ValidDrop) => Promise<ActionResult>;
  /**
   * Creator Studio sync: insert/replace a drop in the arena list (scheduled drops are dropped from the
   * public list in server mode, kept with their publishAt in demo mode), or remove it.
   */
  upsertDrop: (drop: CreatorDrop) => void;
  removeDrop: (id: string) => void;
}

const rankUp = (before: number, after: number): HunterRank | undefined => {
  const a = getRankFromAura(before).rank;
  const b = getRankFromAura(after).rank;
  return a !== b ? b : undefined;
};

// ==========================================================================
// Demo mode: everything local, persisted per persona in localStorage.
// ==========================================================================
export function useDemoAuraFitState(): AuraFitState {
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
    async (questId: string): Promise<ActionResult> => {
      if (!hasPermission(activeRole, 'DO_QUESTS')) return { ok: false, message: 'Your role cannot log quests.', code: 'FORBIDDEN' };
      const quest = quests.find((q) => q.id === questId);
      if (!quest) return { ok: false, message: 'Quest not found.', code: 'NOT_FOUND' };
      if (quest.completed) return { ok: false, message: 'Quest already claimed.', code: 'ALREADY_COMPLETED' };
      const auraEarned = calculateAuraGain(quest.auraReward, activeUser.streakDays);
      const { stat, amount } = quest.statReward;
      setQuests((prev) => markQuestCompleted(prev, questId));
      setActiveUser((prev) => applyQuestCompletion(prev, stat, amount, auraEarned));
      return {
        ok: true,
        auraEarned,
        rankUp: rankUp(activeUser.auraPoints, activeUser.auraPoints + auraEarned),
        message: `+${auraEarned} Aura and +${amount} ${stat.toUpperCase()} earned!`,
      };
    },
    [activeRole, activeUser.auraPoints, activeUser.streakDays, quests, setActiveUser, setQuests],
  );

  const finishWorkout = useCallback(
    async (drop: WorkoutDrop): Promise<ActionResult> => {
      if (!hasPermission(activeRole, 'START_WORKOUT')) return { ok: false, message: 'Your role cannot log workouts.', code: 'FORBIDDEN' };
      const auraEarned = calculateAuraGain(drop.xpPoints, activeUser.streakDays, drop.auraMultiplier);
      setActiveUser((prev) => applyWorkoutCompletion(prev, auraEarned));
      setDrops((prev) => prev.map((d) => (d.id === drop.id ? { ...d, completionsCount: d.completionsCount + 1 } : d)));
      return {
        ok: true,
        auraEarned,
        rankUp: rankUp(activeUser.auraPoints, activeUser.auraPoints + auraEarned),
        message: `Workout conquered! +${auraEarned} Aura claimed.`,
      };
    },
    [activeRole, activeUser.auraPoints, activeUser.streakDays, setActiveUser, setDrops],
  );

  const publishDrop = useCallback(
    async (input: ValidDrop): Promise<ActionResult> => {
      if (!hasPermission(activeRole, 'PUBLISH_WORKOUT_DROP')) {
        return { ok: false, message: 'Creator or Admin permissions required.', code: 'FORBIDDEN' };
      }
      const drop = buildWorkoutDrop(input, activeUser);
      setDrops((prev) => [drop, ...prev]);
      return { ok: true, message: `"${drop.title}" is live for all Hunters!` };
    },
    [activeRole, activeUser, setDrops],
  );

  const demoUpsertDrop = useCallback(
    (drop: CreatorDrop) => setDrops((prev) => (prev.some((d) => d.id === drop.id) ? prev.map((d) => (d.id === drop.id ? drop : d)) : [drop, ...prev])),
    [setDrops],
  );
  const demoRemoveDrop = useCallback((id: string) => setDrops((prev) => prev.filter((d) => d.id !== id)), [setDrops]);

  const reload = useCallback(() => undefined, []);

  return {
    mode: 'demo',
    hydrated,
    loadError: null,
    reload,
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
    upsertDrop: demoUpsertDrop,
    removeDrop: demoRemoveDrop,
  };
}

// ==========================================================================
// Server mode: /api/v1 is the source of truth. Optimistic updates with
// rollback; the server response always replaces the prediction.
// ==========================================================================
const PLACEHOLDER: UserProfile = {
  id: '',
  username: '',
  handle: '',
  role: 'MEMBER',
  avatarUrl: '',
  title: '',
  bio: '',
  auraPoints: 0,
  rank: 'E-RANK',
  level: 1,
  attributes: { str: 0, agi: 0, end: 0, rec: 0 },
  streakDays: 0,
  streakShields: 0,
  totalWorkouts: 0,
  weeklyAuraGained: 0,
};

export function useServerAuraFitState(): AuraFitState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [drops, setDrops] = useState<WorkoutDrop[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Latest values for async handlers (avoid stale closures across awaits).
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const pending = useRef(new Set<string>());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [me, list] = await Promise.all([api.me(), api.drops()]);
    if (!me.ok) {
      if (me.status === 401) {
        window.location.assign('/login?next=/arena');
        return;
      }
      setLoadError(me.message);
      setLoading(false);
      return;
    }
    setProfile(me.data.profile);
    setQuests(me.data.quests);
    setDrops(list.ok ? list.data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeUser = profile ?? PLACEHOLDER;
  const activeRole = activeUser.role;
  const can = useCallback((p: UserPermission) => hasPermission(activeRole, p), [activeRole]);
  const rankInfo = useMemo(() => getRankFromAura(activeUser.auraPoints), [activeUser.auraPoints]);

  const completeQuest = useCallback(
    async (questId: string): Promise<ActionResult> => {
      const before = profileRef.current;
      if (!before) return { ok: false, message: 'Still loading your profile.' };
      if (!hasPermission(before.role, 'DO_QUESTS')) return { ok: false, message: 'Your role cannot log quests.', code: 'FORBIDDEN' };
      const quest = quests.find((q) => q.id === questId);
      if (!quest) return { ok: false, message: 'Quest not found.', code: 'NOT_FOUND' };
      if (quest.completed) return { ok: false, message: 'Quest already completed today.', code: 'ALREADY_COMPLETED' };
      const key = `q:${questId}`;
      if (pending.current.has(key)) return { ok: false, message: 'Already claiming this quest…' };
      pending.current.add(key);

      const estimate = calculateAuraGain(quest.auraReward, before.streakDays);
      setQuests((prev) => markQuestCompleted(prev, questId));
      setProfile((p) => (p ? applyQuestCompletion(p, quest.statReward.stat, quest.statReward.amount, estimate) : p));

      const res = await api.completeQuest(questId);
      pending.current.delete(key);
      if (res.ok) {
        setProfile(res.data.profile);
        const { auraEarned, statGain } = res.data;
        return {
          ok: true,
          auraEarned,
          rankUp: rankUp(before.auraPoints, res.data.profile.auraPoints),
          message: `+${auraEarned} Aura and +${statGain.amount} ${statGain.stat.toUpperCase()} earned!`,
        };
      }
      // Roll back the prediction. On 409 the quest really is done today, so keep it checked.
      setProfile(before);
      if (res.code !== 'ALREADY_COMPLETED') {
        setQuests((prev) => prev.map((q) => (q.id === questId ? quest : q)));
      }
      return { ok: false, message: res.message, code: res.code };
    },
    [quests],
  );

  const finishWorkout = useCallback(async (drop: WorkoutDrop): Promise<ActionResult> => {
    const before = profileRef.current;
    if (!before) return { ok: false, message: 'Still loading your profile.' };
    if (!hasPermission(before.role, 'START_WORKOUT')) return { ok: false, message: 'Your role cannot log workouts.', code: 'FORBIDDEN' };
    const key = `w:${drop.id}`;
    if (pending.current.has(key)) return { ok: false, message: 'Already saving this workout…' };
    pending.current.add(key);

    const estimate = calculateAuraGain(drop.xpPoints, before.streakDays, drop.auraMultiplier);
    const bumpCount = (by: number) => (prev: WorkoutDrop[]) =>
      prev.map((d) => (d.id === drop.id ? { ...d, completionsCount: Math.max(0, d.completionsCount + by) } : d));
    setProfile((p) => (p ? applyWorkoutCompletion(p, estimate) : p));
    setDrops(bumpCount(1));

    const res = await api.completeWorkout(drop.id);
    pending.current.delete(key);
    if (res.ok) {
      setProfile(res.data.profile);
      return {
        ok: true,
        auraEarned: res.data.auraEarned,
        rankUp: rankUp(before.auraPoints, res.data.profile.auraPoints),
        message: `Workout conquered! +${res.data.auraEarned} Aura claimed.`,
      };
    }
    setProfile(before);
    setDrops(bumpCount(-1));
    return {
      ok: false,
      code: res.code,
      message: res.code === 'ALREADY_COMPLETED' ? 'You already logged this workout today — come back tomorrow.' : res.message,
    };
  }, []);

  const publishDrop = useCallback(async (input: ValidDrop): Promise<ActionResult> => {
    const before = profileRef.current;
    if (!before || !hasPermission(before.role, 'PUBLISH_WORKOUT_DROP')) {
      return { ok: false, message: 'Creator or Admin permissions required.', code: 'FORBIDDEN' };
    }
    const res = await api.createDrop(input);
    if (!res.ok) return { ok: false, message: res.message, code: res.code };
    setDrops((prev) => [res.data.drop, ...prev]);
    return { ok: true, message: `"${res.data.drop.title}" is live for all Hunters!` };
  }, []);

  const upsertDrop = useCallback((drop: CreatorDrop) => {
    setDrops((prev) => {
      const rest = prev.filter((d) => d.id !== drop.id);
      if (drop.status !== 'LIVE') return rest;
      const { status: _s, publishAt: _p, createdAt: _c, updatedAt: _u, ...plain } = drop;
      return prev.some((d) => d.id === drop.id) ? prev.map((d) => (d.id === drop.id ? plain : d)) : [plain, ...prev];
    });
  }, []);
  const removeDrop = useCallback((id: string) => setDrops((prev) => prev.filter((d) => d.id !== id)), []);

  const reload = useCallback(() => void load(), [load]);

  return {
    mode: 'server',
    hydrated: !loading && profile !== null,
    loadError,
    reload,
    activeRole,
    setActiveRole: null,
    activeUser,
    rankInfo,
    quests,
    drops,
    can,
    completeQuest,
    finishWorkout,
    publishDrop,
    upsertDrop,
    removeDrop,
  };
}
