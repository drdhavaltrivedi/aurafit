import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  asCreatorDrop,
  buildCreatorDrop,
  makeId,
  sampleCreatorAnalytics,
  validateDropEditorInput,
  type AnalyticsRange,
  type CreatorAnalyticsResponse,
  type CreatorDrop,
  type DropEditorInput,
  type UserProfile,
  type WorkoutDrop,
} from '@aurafit/shared';
import { isApiError } from '../api';
import { creatorApi } from '../api/creatorApi';
import { creatorErrorText, hiddenDropMap } from '../lib/creator';

export type SaveDropResult =
  | { ok: true; drop: CreatorDrop }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export interface CreatorStudioState {
  drops: CreatorDrop[];
  analytics: CreatorAnalyticsResponse | null;
  range: AnalyticsRange;
  setRange: (r: AnalyticsRange) => void;
  /** First load (nothing to show yet). */
  loading: boolean;
  /** Pull-to-refresh / retry with data shown. */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
  save: (input: DropEditorInput, existing: CreatorDrop | null) => Promise<SaveDropResult>;
  remove: (drop: CreatorDrop) => Promise<{ ok: boolean; message: string }>;
  /** Drop id → moderator's reason (server mode; from /api/v1/me/moderation). */
  hidden: Record<string, string>;
}

interface Options {
  /** Demo mode: works on local seed drops and labelled SAMPLE analytics. */
  demo: boolean;
  /** Load at all (role has PUBLISH_WORKOUT_DROP or VIEW_CREATOR_ANALYTICS). */
  enabled: boolean;
  canViewAnalytics: boolean;
  user: Pick<UserProfile, 'id' | 'username' | 'handle' | 'avatarUrl'>;
  /** Demo seed drops (the creator's own are picked by creatorId). */
  seedDrops: readonly WorkoutDrop[];
  /** Called after a successful create / edit / delete (e.g. refetch the public drops list). */
  onChanged?: () => void;
}

/**
 * Last data per user, so leaving the Home tab (or opening a creator page) and coming back shows the
 * previous drops at once while they refresh, and demo edits survive tab switches for the session.
 */
const memory = new Map<string, { drops: CreatorDrop[]; analytics: CreatorAnalyticsResponse | null; hidden: Record<string, string> }>();

/**
 * Creator studio data (mirrors the web useCreatorStudio): the creator's drops (live + scheduled),
 * analytics for a range, hidden-by-moderator reasons, and create / edit / delete.
 */
export function useCreatorStudio({ demo, enabled, canViewAnalytics, user, seedDrops, onChanged }: Options): CreatorStudioState {
  const server = !demo && enabled && !!creatorApi;
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const memKey = `${demo ? 'demo' : 'server'}:${user.id}`;
  const remembered = memory.get(memKey);
  const [serverDrops, setServerDrops] = useState<CreatorDrop[]>(() => (demo ? [] : (remembered?.drops ?? [])));
  const [analytics, setAnalytics] = useState<CreatorAnalyticsResponse | null>(() => (demo ? null : (remembered?.analytics ?? null)));
  const [hidden, setHidden] = useState<Record<string, string>>(() => (demo ? {} : (remembered?.hidden ?? {})));
  const [loaded, setLoaded] = useState(!!remembered);
  const [busy, setBusy] = useState(server);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  // Demo: local copy of the seed creator's drops (edits live for this session only).
  const [demoDrops, setDemoDrops] = useState<CreatorDrop[]>(
    () => (demo ? remembered?.drops : undefined) ?? seedDrops.filter((d) => d.creatorId === user.id).map((d) => asCreatorDrop(d)),
  );

  useEffect(() => {
    if (!demo && !loaded) return;
    memory.set(memKey, demo ? { drops: demoDrops, analytics: null, hidden: {} } : { drops: serverDrops, analytics, hidden });
  }, [memKey, demo, loaded, demoDrops, serverDrops, analytics, hidden]);

  const load = useCallback(async () => {
    if (!server || !creatorApi) return;
    const c = creatorApi;
    const id = ++seq.current;
    setBusy(true);
    const [drops, stats, moderation] = await Promise.allSettled([
      c.myDrops(),
      canViewAnalytics ? c.analytics(range) : Promise.resolve(null),
      // Optional: older servers / failures just mean "nothing hidden".
      c.moderation(),
    ]);
    if (id !== seq.current) return;
    if (moderation.status === 'fulfilled') setHidden(hiddenDropMap(moderation.value));
    if (drops.status === 'fulfilled') setServerDrops(drops.value.drops);
    if (stats.status === 'fulfilled') setAnalytics(stats.value);
    const failed = drops.status === 'rejected' ? drops.reason : stats.status === 'rejected' ? stats.reason : null;
    setError(failed ? creatorErrorText(failed) : null);
    setLoaded(true);
    setBusy(false);
  }, [server, canViewAnalytics, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAnalytics = useCallback(async () => {
    if (!server || !creatorApi || !canViewAnalytics) return;
    try {
      setAnalytics(await creatorApi.analytics(range));
    } catch {
      /* keep the previous figures; the next reload retries */
    }
  }, [server, canViewAnalytics, range]);

  const save = useCallback<CreatorStudioState['save']>(
    async (input, existing) => {
      if (demo) {
        const v = validateDropEditorInput(input, { patch: !!existing });
        if (!v.ok) return { ok: false, message: 'Check the highlighted fields.', fieldErrors: v.fieldErrors };
        const drop = buildCreatorDrop(v.value, user, existing?.id ?? makeId('drop'), existing ?? undefined);
        setDemoDrops((prev) => (prev.some((d) => d.id === drop.id) ? prev.map((d) => (d.id === drop.id ? drop : d)) : [drop, ...prev]));
        return { ok: true, drop };
      }
      if (!creatorApi) return { ok: false, message: 'Publishing is not available in this build.' };
      try {
        const res = existing ? await creatorApi.update(existing.id, input) : await creatorApi.create(input);
        const drop = res.drop;
        setServerDrops((prev) => (prev.some((d) => d.id === drop.id) ? prev.map((d) => (d.id === drop.id ? drop : d)) : [drop, ...prev]));
        void refreshAnalytics();
        changed.current?.();
        return { ok: true, drop };
      } catch (err) {
        return { ok: false, message: creatorErrorText(err), fieldErrors: isApiError(err) ? err.fieldErrors : undefined };
      }
    },
    [demo, user, refreshAnalytics],
  );

  const remove = useCallback<CreatorStudioState['remove']>(
    async (drop) => {
      if (demo) {
        setDemoDrops((prev) => prev.filter((d) => d.id !== drop.id));
        return { ok: true, message: `"${drop.title}" was deleted.` };
      }
      if (!creatorApi) return { ok: false, message: 'Deleting is not available in this build.' };
      try {
        await creatorApi.remove(drop.id);
      } catch (err) {
        // Already gone counts as deleted.
        if (!(isApiError(err) && err.status === 404)) return { ok: false, message: creatorErrorText(err) };
      }
      setServerDrops((prev) => prev.filter((d) => d.id !== drop.id));
      void refreshAnalytics();
      changed.current?.();
      return { ok: true, message: `"${drop.title}" was deleted.` };
    },
    [demo, refreshAnalytics],
  );

  const demoAnalytics = useMemo(() => (demo ? sampleCreatorAnalytics(demoDrops, range) : null), [demo, demoDrops, range]);

  return {
    drops: demo ? demoDrops : serverDrops,
    analytics: demo ? demoAnalytics : analytics,
    range,
    setRange,
    loading: server && busy && !loaded,
    refreshing: server && busy && loaded,
    error: demo ? null : error,
    reload: () => void load(),
    save,
    remove,
    hidden: demo ? {} : hidden,
  };
}
