import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateSquadRequest, MySquad, SquadActivityItem, SquadLeaderboardEntry, UpdateSquadRequest } from '@aurafit/shared';
import { isApiError } from '../api';
import { squadsApi } from '../api/squads';
import { squadErrorText } from '../lib/squads';
import { errorMessage } from './useApi';

export interface SquadState {
  /** undefined while the first load runs; null when not in a squad. */
  squad: MySquad | null | undefined;
  board: SquadLeaderboardEntry[] | null;
  feed: SquadActivityItem[] | null;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Each action resolves with an error message, or null on success. */
  create: (input: CreateSquadRequest) => Promise<string | null>;
  join: (code: string) => Promise<string | null>;
  leave: () => Promise<string | null>;
  regenerate: () => Promise<string | null>;
  update: (patch: UpdateSquadRequest) => Promise<string | null>;
  remove: (profileId: string) => Promise<string | null>;
}

const toMessage = (err: unknown) => (isApiError(err) ? squadErrorText(err.code, errorMessage(err)) : errorMessage(err));

/** Signed-in squad data + actions (GET /api/v1/squads/me, leaderboard, activity). `enabled=false` in demo. */
export function useSquad(enabled: boolean, refreshKey?: number): SquadState {
  const [squad, setSquad] = useState<MySquad | null | undefined>(undefined);
  const [board, setBoard] = useState<SquadLeaderboardEntry[] | null>(null);
  const [feed, setFeed] = useState<SquadActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const loadFeed = useCallback(async () => {
    try {
      setFeed((await squadsApi.activity()).items);
    } catch {
      setFeed(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++seq.current;
    setRefreshing(true);
    const [me, lb] = await Promise.allSettled([squadsApi.me(), squadsApi.leaderboard()]);
    if (id !== seq.current) return;
    if (me.status === 'fulfilled') {
      setSquad(me.value.squad);
      setError(null);
      if (me.value.squad) void loadFeed();
      else setFeed(null);
    } else setError(toMessage(me.reason));
    if (lb.status === 'fulfilled') setBoard(lb.value.squads);
    setRefreshing(false);
  }, [enabled, loadFeed]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const after = useCallback(
    (next: MySquad | null) => {
      setSquad(next);
      if (next) void loadFeed();
      else setFeed(null);
      squadsApi.leaderboard().then((r) => setBoard(r.squads), () => {});
    },
    [loadFeed]
  );

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      return null;
    } catch (err) {
      return toMessage(err);
    }
  }, []);

  return {
    squad,
    board,
    feed,
    error,
    refreshing,
    refresh,
    create: (input) => run(async () => after((await squadsApi.create(input)).squad)),
    join: (code) => run(async () => after((await squadsApi.join(code)).squad)),
    leave: () =>
      run(async () => {
        await squadsApi.leave();
        after(null);
      }),
    regenerate: () =>
      run(async () => {
        const { inviteCode } = await squadsApi.regenerateInviteCode();
        setSquad((s) => (s ? { ...s, inviteCode } : s));
      }),
    update: (patch) => run(async () => after((await squadsApi.update(patch)).squad)),
    remove: (profileId) => run(async () => after((await squadsApi.removeMember(profileId)).squad)),
  };
}
