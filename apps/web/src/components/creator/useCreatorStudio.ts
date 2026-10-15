'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  asCreatorDrop,
  buildCreatorDrop,
  dropStatus,
  makeId,
  sampleCreatorAnalytics,
  validateDropEditorInput,
  type AnalyticsRange,
  type CreatorAnalyticsResponse,
  type CreatorDrop,
  type DropEditorInput,
  type WorkoutDrop,
  MODERATION_ROUTES,
  type AccountModerationResponse,
} from '@aurafit/shared';
import type { AuraFitState } from '@/hooks/useAuraFitState';
import { creatorApi, creatorFetch } from '@/lib/creator/client';
import type { SaveDropResult } from './DropEditor';

export interface CreatorStudioData {
  drops: CreatorDrop[];
  analytics: CreatorAnalyticsResponse | null;
  range: AnalyticsRange;
  setRange: (r: AnalyticsRange) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  save: (input: DropEditorInput, existing: CreatorDrop | null) => Promise<SaveDropResult & { drop?: CreatorDrop }>;
  remove: (drop: CreatorDrop) => Promise<{ ok: boolean; message: string }>;
  /** Drop id → moderator's reason, for drops an admin hid (server mode; from /api/v1/me/moderation). */
  hidden: Record<string, string>;
}

/** Demo drops carry their schedule in localStorage; seed drops are plain WorkoutDrops (always live). */
function toCreatorDrop(d: WorkoutDrop, now: Date): CreatorDrop {
  const c = d as Partial<CreatorDrop> & WorkoutDrop;
  if (typeof c.createdAt === 'string') return { ...(c as CreatorDrop), status: dropStatus(c.publishAt ?? null, now) };
  return asCreatorDrop(d);
}

/**
 * Creator Studio data: the creator's drops (live + scheduled), analytics for a range, and
 * create / edit / delete. Server mode talks to /api/v1/creator/** and /api/v1/drops/{id}; demo mode
 * works on the local demo drops and SAMPLE analytics (labelled as such by the UI).
 */
export function useCreatorStudio(state: AuraFitState, enabled: boolean): CreatorStudioData {
  const { mode, activeUser, upsertDrop, removeDrop } = state;
  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [serverDrops, setServerDrops] = useState<CreatorDrop[]>([]);
  const [analytics, setAnalytics] = useState<CreatorAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(mode === 'server');
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Record<string, string>>({});
  const seq = useRef(0);

  const demoDrops = useMemo(() => {
    if (mode !== 'demo') return [];
    const now = new Date();
    return state.drops.filter((d) => d.creatorId === activeUser.id).map((d) => toCreatorDrop(d, now));
  }, [mode, state.drops, activeUser.id]);

  const load = useCallback(async () => {
    if (mode !== 'server' || !enabled) return;
    const id = ++seq.current;
    setLoading(true);
    const [drops, stats, moderation] = await Promise.all([
      creatorApi.myDrops(),
      creatorApi.analytics(range),
      // Owned by admin moderation; optional here (ignored when unavailable).
      creatorFetch<AccountModerationResponse>(MODERATION_ROUTES.me),
    ]);
    if (id !== seq.current) return;
    if (moderation.ok && Array.isArray(moderation.data?.hiddenDrops)) {
      setHidden(Object.fromEntries(moderation.data.hiddenDrops.map((d) => [d.id, d.hiddenReason])));
    }
    if (drops.ok) setServerDrops(drops.data.drops);
    if (stats.ok) setAnalytics(stats.data);
    setError(!drops.ok ? drops.message : !stats.ok ? stats.message : null);
    setLoading(false);
  }, [mode, enabled, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAnalytics = useCallback(async () => {
    if (mode !== 'server') return;
    const res = await creatorApi.analytics(range);
    if (res.ok) setAnalytics(res.data);
  }, [mode, range]);

  const save = useCallback<CreatorStudioData['save']>(
    async (input, existing) => {
      if (mode === 'demo') {
        const v = validateDropEditorInput(input, { patch: !!existing });
        if (!v.ok) return { ok: false, message: 'Check the highlighted fields.', fieldErrors: v.fieldErrors };
        const drop = buildCreatorDrop(v.value, activeUser, existing?.id ?? makeId('drop'), existing ?? undefined);
        upsertDrop(drop);
        return { ok: true, drop };
      }
      const res = existing ? await creatorApi.update(existing.id, input) : await creatorApi.create(input);
      if (!res.ok) {
        return { ok: false, message: res.code === 'VALIDATION_FAILED' ? 'Check the highlighted fields.' : res.message, fieldErrors: res.fieldErrors };
      }
      const drop = res.data.drop;
      setServerDrops((prev) => (prev.some((d) => d.id === drop.id) ? prev.map((d) => (d.id === drop.id ? drop : d)) : [drop, ...prev]));
      upsertDrop(drop);
      void refreshAnalytics();
      return { ok: true, drop };
    },
    [mode, activeUser, upsertDrop, refreshAnalytics],
  );

  const remove = useCallback<CreatorStudioData['remove']>(
    async (drop) => {
      if (mode === 'server') {
        const res = await creatorApi.remove(drop.id);
        if (!res.ok && res.status !== 404) return { ok: false, message: res.message };
        setServerDrops((prev) => prev.filter((d) => d.id !== drop.id));
        void refreshAnalytics();
      }
      removeDrop(drop.id);
      return { ok: true, message: `"${drop.title}" was deleted.` };
    },
    [mode, removeDrop, refreshAnalytics],
  );

  const drops = mode === 'demo' ? demoDrops : serverDrops;
  const demoAnalytics = useMemo(() => (mode === 'demo' ? sampleCreatorAnalytics(demoDrops, range) : null), [mode, demoDrops, range]);

  return {
    drops,
    analytics: mode === 'demo' ? demoAnalytics : analytics,
    range,
    setRange,
    loading: mode === 'server' && loading,
    error,
    reload: () => void load(),
    save,
    remove,
    hidden: mode === 'server' ? hidden : {},
  };
}
