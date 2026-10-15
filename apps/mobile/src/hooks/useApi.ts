import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert, AppState } from 'react-native';
import type { WorkoutDrop } from '@aurafit/shared';
import { api, isApiError, type ApiClient } from '../api';
import { markQuestCompleted, optimisticCompleteQuest, optimisticCompleteWorkout } from '../api/optimistic';
import type { CompleteQuestResponse, CompleteWorkoutResponse, LeaderboardResponse, MeResponse } from '../api/types';
import { isSuspendedError, notifySuspended, suspendedErrorText } from '../lib/moderation';

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True while a background refetch runs with data already shown. */
  refreshing: boolean;
  refetch: () => Promise<void>;
  /** Local overwrite for optimistic updates. */
  setData: Dispatch<SetStateAction<T | null>>;
}

export function errorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === 'TIMEOUT') return 'The server took too long to respond.';
    if (err.code === 'NETWORK_ERROR') return "Can't reach AuraFit. Check your connection.";
    if (err.code === 'PROFILE_NOT_FOUND') return 'Your hunter profile is still being set up. Try again in a moment.';
    if (err.code === 'RATE_LIMITED') return 'Slow down a little — try again in a moment.';
    if (err.status === 401) return 'Your session expired. Please log in again.';
    if (isSuspendedError(err)) {
      // Suspended accounts get 403 SUSPENDED on every game mutation: show why (and refresh the banner).
      const text = suspendedErrorText(err);
      notifySuspended(text);
      return text;
    }
    if (err.status === 403) return "You don't have access to this.";
    return err.message;
  }
  return 'Something went wrong.';
}

const REFETCH_MIN_INTERVAL_MS = 30_000;

/**
 * Small fetch-state hook: loads on mount, refetches when the app returns to the foreground
 * (throttled), ignores stale responses, and aborts in-flight requests on unmount.
 */
function useQuery<T>(fetcher: ((c: ApiClient, signal: AbortSignal) => Promise<T>) | null, enabled = true): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled && !!api && !!fetcher);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastFetch = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  const run = useCallback(async () => {
    const f = fetcherRef.current;
    if (!api || !f) return;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++seq.current;
    lastFetch.current = Date.now();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await f(api, ctrl.signal);
      if (id !== seq.current) return;
      hasData.current = true;
      setData(result);
      setError(null);
    } catch (err) {
      if (id !== seq.current || (isApiError(err) && err.code === 'ABORTED')) return;
      setError(errorMessage(err));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastFetch.current > REFETCH_MIN_INTERVAL_MS) void run();
    });
    return () => {
      sub.remove();
      seq.current++;
      controller.current?.abort();
    };
  }, [enabled, run]);

  return { data, error, loading, refreshing, refetch: run, setData };
}

export function useMe(enabled = true) {
  return useQuery<MeResponse>((c, signal) => c.getMe(signal), enabled);
}

export function useDrops(enabled = true) {
  return useQuery<WorkoutDrop[]>((c, signal) => c.getDrops(signal), enabled);
}

export function useLeaderboard(enabled = true) {
  return useQuery<LeaderboardResponse>((c, signal) => c.getLeaderboard(signal), enabled);
}

const ALREADY_CLAIMED_TITLE = 'Already claimed today';

/** Completes a quest with an optimistic update; rolls back on failure. Resolves with the server result on success. */
export function useCompleteQuest(me: QueryState<MeResponse>) {
  const pending = useRef(new Set<string>());
  const { setData, refetch } = me;
  const meRef = useRef(me.data);
  meRef.current = me.data;

  return useCallback(
    async (questId: string): Promise<CompleteQuestResponse | null> => {
      const current = meRef.current;
      if (!api || !current || pending.current.has(questId)) return null;
      const optimistic = optimisticCompleteQuest(current, questId);
      if (!optimistic) {
        if (current.quests.some((q) => q.id === questId && q.completed)) {
          Alert.alert(ALREADY_CLAIMED_TITLE, 'You already completed this quest today. Come back tomorrow!');
        }
        return null;
      }
      pending.current.add(questId);
      setData(optimistic);
      try {
        const res = await api.completeQuest(questId);
        // Server is authoritative for aura/stats/rank.
        setData((d) => (d ? { ...markQuestCompleted(d, questId), profile: res.profile } : d));
        return res;
      } catch (err) {
        if (isApiError(err) && err.code === 'ALREADY_COMPLETED') {
          // Roll back the optimistic aura but keep the quest checked, then resync.
          setData((d) => (d ? markQuestCompleted({ ...d, profile: current.profile }, questId) : d));
          Alert.alert(ALREADY_CLAIMED_TITLE, 'You already completed this quest today. Come back tomorrow!');
          void refetch();
        } else {
          setData((d) =>
            d ? { profile: current.profile, quests: d.quests.map((q) => (q.id === questId ? current.quests.find((o) => o.id === questId) ?? q : q)) } : d
          );
          Alert.alert("Couldn't complete quest", errorMessage(err));
        }
        return null;
      } finally {
        pending.current.delete(questId);
      }
    },
    [setData, refetch]
  );
}

/** Claims a finished workout with an optimistic update; rolls back on failure. Resolves with the server result on success. */
export function useCompleteWorkout(me: QueryState<MeResponse>) {
  const pending = useRef(new Set<string>());
  const { setData, refetch } = me;
  const meRef = useRef(me.data);
  meRef.current = me.data;

  return useCallback(
    async (drop: WorkoutDrop): Promise<CompleteWorkoutResponse | null> => {
      const current = meRef.current;
      if (!api || !current || pending.current.has(drop.id)) return null;
      pending.current.add(drop.id);
      setData(optimisticCompleteWorkout(current, drop));
      try {
        const res = await api.completeWorkout(drop.id);
        setData((d) => (d ? { ...d, profile: res.profile } : d));
        return res;
      } catch (err) {
        setData((d) => (d ? { ...d, profile: current.profile } : d));
        if (isApiError(err) && err.code === 'ALREADY_COMPLETED') {
          Alert.alert(ALREADY_CLAIMED_TITLE, 'You already claimed aura for this drop today.');
          void refetch();
        } else {
          Alert.alert("Couldn't claim workout", errorMessage(err));
        }
        return null;
      } finally {
        pending.current.delete(drop.id);
      }
    },
    [setData, refetch]
  );
}
