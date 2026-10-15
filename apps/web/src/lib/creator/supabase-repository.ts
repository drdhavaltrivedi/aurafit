import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dropStatus,
  toExercises,
  xpForDrop,
  type CreatorAnalyticsDrop,
  type CreatorDrop,
  type FollowedCreator,
  type ValidDropEditorInput,
} from '@aurafit/shared';
import { rowToDrop } from '@/lib/data/mappers';
import { RepositoryError } from '@/lib/data/supabase-repository';
import type { DropRow } from '@/lib/data/types';
import type { AnalyticsSnapshot, CreatorRecord, CreatorRepository, FollowResult, UnfollowResult } from './types';

function fail(operation: string, error: { message?: string; code?: string } | null): never {
  throw new RepositoryError(operation, error);
}

const CREATOR_DROP_COLUMNS =
  'id, title, tagline, creator_id, vibe_tag, duration_minutes, calories_burn_estimate, aura_multiplier, xp_points, difficulty, category, exercises, cover_from, cover_to, creator_badge, likes_count, completions_count, created_at, updated_at, publish_at, creator:profiles!workout_drops_creator_id_fkey(username, handle, avatar_url)';

// auth_id is read (service role only) to flag the official system profile; it is never returned.
const CREATOR_PROFILE_COLUMNS = 'id, auth_id, username, handle, avatar_url, title, bio, role';

type CreatorDropRow = DropRow & { publish_at: string | null; updated_at: string; created_at: string };

interface CreatorProfileRow {
  id: string;
  auth_id: string | null;
  username: string;
  handle: string;
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  role: 'MEMBER' | 'CREATOR' | 'ADMIN';
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function rowToCreatorDrop(row: CreatorDropRow, now: Date = new Date()): CreatorDrop {
  const publishAt = iso(row.publish_at);
  return {
    ...rowToDrop(row),
    status: dropStatus(publishAt, now),
    publishAt,
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? iso(row.created_at) ?? '',
  };
}

export function rowToCreatorRecord(row: CreatorProfileRow): CreatorRecord | null {
  if (row.role !== 'CREATOR' && row.role !== 'ADMIN') return null;
  return {
    id: row.id,
    username: row.username,
    handle: row.handle,
    avatarUrl: row.avatar_url ?? '',
    title: row.title ?? '',
    bio: row.bio ?? '',
    role: row.role,
    official: row.auth_id === null,
  };
}

/** Content columns written by create / update (counters and badge are never touched). */
function contentRow(dropId: string, input: ValidDropEditorInput) {
  return {
    title: input.title,
    tagline: input.tagline,
    vibe_tag: input.vibeTag,
    duration_minutes: input.durationMinutes,
    calories_burn_estimate: input.caloriesBurnEstimate,
    aura_multiplier: input.auraMultiplier,
    xp_points: xpForDrop(input.durationMinutes, input.difficulty),
    difficulty: input.difficulty,
    category: input.category,
    exercises: toExercises(dropId, input.exercises),
    cover_from: input.coverGradient[0],
    cover_to: input.coverGradient[1],
  };
}

/** public.creator_analytics jsonb → AnalyticsSnapshot (snake_case → camelCase). */
export function toAnalyticsSnapshot(r: Record<string, unknown>, now: Date = new Date()): AnalyticsSnapshot {
  const t = (r.totals ?? {}) as Record<string, unknown>;
  const drops = Array.isArray(r.drops) ? (r.drops as Record<string, unknown>[]) : [];
  const series = Array.isArray(r.series) ? (r.series as Record<string, unknown>[]) : [];
  return {
    from: str(r.from),
    to: str(r.to),
    totals: {
      followers: num(t.followers),
      liveDrops: num(t.live_drops),
      scheduledDrops: num(t.scheduled_drops),
      completions: num(t.completions),
      uniqueAthletes: num(t.unique_athletes),
      auraAwarded: num(t.aura_awarded),
    },
    drops: drops.map((d): CreatorAnalyticsDrop => {
      const publishAt = iso(d.publish_at);
      return {
        dropId: str(d.drop_id),
        title: str(d.title),
        status: dropStatus(publishAt, now),
        publishAt,
        completions: num(d.completions),
        uniqueAthletes: num(d.unique_athletes),
        lastCompletedOn: typeof d.last_completed_on === 'string' ? d.last_completed_on : null,
        allTimeCompletions: num(d.all_time_completions),
      };
    }),
    series: series.map((p) => ({ date: str(p.date), completions: num(p.completions) })),
  };
}

/** CreatorRepository backed by Supabase with the secret (service_role) key. */
export function createSupabaseCreatorRepository(db: SupabaseClient): CreatorRepository {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) fail(fn, error);
    const r = (data ?? {}) as Record<string, unknown>;
    if (typeof r.status !== 'string') fail(fn, { message: 'missing status in result' });
    return r as Record<string, unknown> & { status: string };
  };

  return {
    async listOwnDrops(creatorId) {
      const { data, error } = await db
        .from('workout_drops')
        .select(CREATOR_DROP_COLUMNS)
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) fail('listOwnDrops', error);
      const now = new Date();
      return ((data ?? []) as unknown as CreatorDropRow[]).map((r) => rowToCreatorDrop(r, now));
    },

    async getDropForEdit(dropId) {
      const { data, error } = await db.from('workout_drops').select(CREATOR_DROP_COLUMNS).eq('id', dropId).maybeSingle();
      if (error) fail('getDropForEdit', error);
      return data ? rowToCreatorDrop(data as unknown as CreatorDropRow) : null;
    },

    async createDrop({ id, creatorId, input }) {
      const row = { id, creator_id: creatorId, ...contentRow(id, input), publish_at: input.publishAt ?? null };
      const { data, error } = await db.from('workout_drops').insert(row).select(CREATOR_DROP_COLUMNS).single();
      if (error) fail('createDrop', error);
      return rowToCreatorDrop(data as unknown as CreatorDropRow);
    },

    async updateDrop(dropId, creatorId, input) {
      const row: Record<string, unknown> = contentRow(dropId, input);
      if (input.publishAt !== undefined) row.publish_at = input.publishAt;
      const { data, error } = await db
        .from('workout_drops')
        .update(row)
        .eq('id', dropId)
        .eq('creator_id', creatorId)
        .select(CREATOR_DROP_COLUMNS)
        .maybeSingle();
      if (error) fail('updateDrop', error);
      return data ? rowToCreatorDrop(data as unknown as CreatorDropRow) : null;
    },

    async deleteDrop(dropId, creatorId) {
      const { data, error } = await db.from('workout_drops').delete().eq('id', dropId).eq('creator_id', creatorId).select('id');
      if (error) fail('deleteDrop', error);
      return (data ?? []).length > 0;
    },

    async findCreatorByHandle(handle) {
      const { data, error } = await db
        .from('profiles')
        .select(CREATOR_PROFILE_COLUMNS)
        .eq('handle', handle)
        .in('role', ['CREATOR', 'ADMIN'])
        .maybeSingle();
      if (error) fail('findCreatorByHandle', error);
      return data ? rowToCreatorRecord(data as CreatorProfileRow) : null;
    },

    async followerCount(creatorId) {
      const { count, error } = await db.from('creator_follows').select('creator_id', { count: 'exact', head: true }).eq('creator_id', creatorId);
      if (error) fail('followerCount', error);
      return count ?? 0;
    },

    async isFollowing(followerId, creatorId) {
      const { data, error } = await db
        .from('creator_follows')
        .select('creator_id')
        .eq('follower_id', followerId)
        .eq('creator_id', creatorId)
        .maybeSingle();
      if (error) fail('isFollowing', error);
      return !!data;
    },

    async follow(followerId, creatorId): Promise<FollowResult> {
      const r = await rpc('follow_creator', { p_follower_id: followerId, p_creator_id: creatorId });
      switch (r.status) {
        case 'followed':
        case 'already_following':
          return { status: r.status, followerCount: num(r.follower_count) };
        case 'creator_not_found':
        case 'cannot_follow_self':
        case 'profile_not_found':
          return { status: r.status };
        default:
          fail('follow_creator', { message: `unexpected status ${r.status}` });
      }
    },

    async unfollow(followerId, creatorId): Promise<UnfollowResult> {
      const r = await rpc('unfollow_creator', { p_follower_id: followerId, p_creator_id: creatorId });
      if (r.status !== 'unfollowed' && r.status !== 'not_following') fail('unfollow_creator', { message: `unexpected status ${r.status}` });
      return { status: r.status, followerCount: num(r.follower_count) };
    },

    async listFollowing(followerId) {
      const { data, error } = await db
        .from('creator_follows')
        .select(`created_at, creator:profiles!creator_follows_creator_id_fkey(${CREATOR_PROFILE_COLUMNS})`)
        .eq('follower_id', followerId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) fail('listFollowing', error);
      const rows = (data ?? []) as unknown as Array<{ created_at: string; creator: CreatorProfileRow | null }>;
      return rows.flatMap((r): FollowedCreator[] => {
        const c = r.creator ? rowToCreatorRecord(r.creator) : null;
        if (!c) return [];
        const { bio: _bio, ...summary } = c;
        return [{ ...summary, followedAt: iso(r.created_at) ?? '' }];
      });
    },

    async analytics(creatorId, days, now) {
      const r = await rpc('creator_analytics', { p_creator_id: creatorId, p_days: days, p_now: now.toISOString() });
      if (r.status === 'profile_not_found') return null;
      if (r.status !== 'ok') fail('creator_analytics', { message: `unexpected status ${r.status}` });
      return toAnalyticsSnapshot(r, now);
    },
  };
}
