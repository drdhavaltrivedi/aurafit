import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AccountModerationResponse } from '@aurafit/shared';
import { api, isApiError } from '../api';
import { createModerationApi, type ModerationApi } from '../api/moderation';
import { onSuspendedError } from '../lib/moderation';
import { errorMessage } from './useApi';

/** Moderation endpoints bound to the signed-in API client (`null` in demo mode). */
export const moderationApi: ModerationApi | null = api ? createModerationApi(api) : null;

/** The bound moderation API; throws in demo mode (admin actions only run signed in). */
export function requireModerationApi(): ModerationApi {
  if (!moderationApi) throw new Error('The AuraFit API is not configured (demo mode).');
  return moderationApi;
}

export interface AccountModeration {
  suspended: boolean;
  suspensionReason: string | null;
  hiddenDrops: AccountModerationResponse['hiddenDrops'];
  refresh: () => Promise<void>;
}

const FOREGROUND_REFRESH_MS = 60_000;

/**
 * The signed-in user's own moderation state (GET /api/v1/me/moderation). Refreshes on foreground and
 * immediately when any request is rejected with 403 SUSPENDED. Errors keep the last known state.
 */
export function useAccountModeration(enabled: boolean): AccountModeration {
  const [state, setState] = useState<AccountModerationResponse | null>(null);
  const seq = useRef(0);
  const last = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !moderationApi) return;
    const id = ++seq.current;
    last.current = Date.now();
    try {
      const res = await moderationApi.me();
      if (id === seq.current) setState(res);
    } catch {
      /* keep the last known state; the banner is best-effort */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    void refresh();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - last.current > FOREGROUND_REFRESH_MS) void refresh();
    });
    const unsubscribe = onSuspendedError(() => {
      // Show the banner right away (the reason arrives with the refresh).
      setState((prev) => ({ suspendedAt: null, suspensionReason: null, hiddenDrops: [], ...prev, suspended: true }));
      void refresh();
    });
    return () => {
      seq.current++;
      appSub.remove();
      unsubscribe();
    };
  }, [enabled, refresh]);

  return useMemo(
    () => ({
      suspended: !!state?.suspended,
      suspensionReason: state?.suspensionReason ?? null,
      hiddenDrops: state?.hiddenDrops ?? [],
      refresh,
    }),
    [state, refresh]
  );
}

export interface AdminQuery<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads `load` on mount and whenever `load` changes; `reload()` refetches. Ignores stale responses. */
export function useAdminQuery<T>(load: ((m: ModerationApi, signal: AbortSignal) => Promise<T>) | null): AdminQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!load);
  const seq = useRef(0);
  const ctrl = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!load || !moderationApi) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const id = ++seq.current;
    setLoading(true);
    try {
      const res = await load(moderationApi, c.signal);
      if (id !== seq.current) return;
      setData(res);
      setError(null);
    } catch (err) {
      if (id !== seq.current || (isApiError(err) && err.code === 'ABORTED')) return;
      setError(errorMessage(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void reload();
    return () => {
      seq.current++;
      ctrl.current?.abort();
    };
  }, [reload]);

  return { data, error, loading, reload };
}
