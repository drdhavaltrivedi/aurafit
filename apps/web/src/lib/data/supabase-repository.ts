import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkoutDrop } from '@aurafit/shared';
import { dropToInsertRow, rowToDrop, rowToLeaderboardHunter, rowToSquad } from './mappers';
import type { CompleteActionInput, DropRow, GameActionResult, GameRepository, ProfileRow, QuestRow, SquadRow } from './types';

const PROFILE_COLUMNS =
  'id, auth_id, username, handle, role, avatar_url, title, bio, aura_points, rank, level, str_stat, agi_stat, end_stat, rec_stat, streak_days, streak_shields, last_active_date, squad_id, gym_id, total_workouts, weekly_aura_gained';
const QUEST_COLUMNS =
  'id, title, subtitle, category, aura_reward, stat_reward_stat, stat_reward_amount, duration_minutes, difficulty, target_count, unit, icon, accent_color, description';
const DROP_COLUMNS =
  'id, title, tagline, creator_id, vibe_tag, duration_minutes, calories_burn_estimate, aura_multiplier, xp_points, difficulty, category, exercises, cover_from, cover_to, creator_badge, likes_count, completions_count, created_at, creator:profiles!workout_drops_creator_id_fkey(username, handle, avatar_url)';

export class RepositoryError extends Error {
  constructor(operation: string, cause: { message?: string; code?: string } | null) {
    super(`${operation} failed${cause?.code ? ` (${cause.code})` : ''}: ${cause?.message ?? 'unknown error'}`);
    this.name = 'RepositoryError';
  }
}

function fail(operation: string, error: { message?: string; code?: string } | null): never {
  throw new RepositoryError(operation, error);
}

function toActionResult(raw: unknown): GameActionResult {
  const r = (raw ?? {}) as { status?: string; profile?: ProfileRow };
  switch (r.status) {
    case 'completed':
      if (!r.profile) throw new RepositoryError('game action', { message: 'missing profile in result' });
      return { status: 'completed', profile: r.profile };
    case 'already_completed':
    case 'not_found':
    case 'profile_not_found':
      return { status: r.status };
    default:
      throw new RepositoryError('game action', { message: `unexpected status ${String(r.status)}` });
  }
}

/** GameRepository backed by Supabase using the secret (service_role) key. */
export function createSupabaseRepository(db: SupabaseClient): GameRepository {
  return {
    async getProfileByAuthId(authId) {
      const { data, error } = await db.from('profiles').select(PROFILE_COLUMNS).eq('auth_id', authId).maybeSingle();
      if (error) fail('getProfileByAuthId', error);
      return (data as ProfileRow | null) ?? null;
    },

    async listQuests() {
      const { data, error } = await db.from('quests').select(QUEST_COLUMNS).order('category').order('id');
      if (error) fail('listQuests', error);
      return (data ?? []) as QuestRow[];
    },

    async getQuest(id) {
      const { data, error } = await db.from('quests').select(QUEST_COLUMNS).eq('id', id).maybeSingle();
      if (error) fail('getQuest', error);
      return (data as QuestRow | null) ?? null;
    },

    async listCompletedQuestIds(userId, dateKey) {
      const { data, error } = await db.from('user_quest_logs').select('quest_id').eq('user_id', userId).eq('date_key', dateKey);
      if (error) fail('listCompletedQuestIds', error);
      return (data ?? []).map((r: { quest_id: string }) => r.quest_id);
    },

    async completeQuest({ userId, itemId, aura, dateKey }: CompleteActionInput) {
      const { data, error } = await db.rpc('complete_quest', { p_user_id: userId, p_quest_id: itemId, p_aura: aura, p_date_key: dateKey });
      if (error) fail('complete_quest', error);
      return toActionResult(data);
    },

    async listDrops() {
      const { data, error } = await db.from('workout_drops').select(DROP_COLUMNS).order('created_at', { ascending: false }).limit(100);
      if (error) fail('listDrops', error);
      return ((data ?? []) as unknown as DropRow[]).map(rowToDrop);
    },

    async getDrop(id) {
      const { data, error } = await db.from('workout_drops').select(DROP_COLUMNS).eq('id', id).maybeSingle();
      if (error) fail('getDrop', error);
      return data ? rowToDrop(data as unknown as DropRow) : null;
    },

    async createDrop(drop: WorkoutDrop) {
      const { data, error } = await db.from('workout_drops').insert(dropToInsertRow(drop)).select(DROP_COLUMNS).single();
      if (error) fail('createDrop', error);
      return rowToDrop(data as unknown as DropRow);
    },

    async completeWorkout({ userId, itemId, aura, dateKey }: CompleteActionInput) {
      const { data, error } = await db.rpc('complete_workout', { p_user_id: userId, p_drop_id: itemId, p_aura: aura, p_date_key: dateKey });
      if (error) fail('complete_workout', error);
      return toActionResult(data);
    },

    async leaderboard(limit) {
      const [hunters, squads] = await Promise.all([
        db.from('profiles').select(PROFILE_COLUMNS).order('aura_points', { ascending: false }).order('id').limit(limit),
        db
          .from('squads')
          .select('id, name, tag, avatar, total_aura, member_count, max_members, streak_days, weekly_goal_progress, status, leader:profiles!squads_leader_id_fkey(username)')
          .order('total_aura', { ascending: false })
          .limit(limit),
      ]);
      if (hunters.error) fail('leaderboard.hunters', hunters.error);
      if (squads.error) fail('leaderboard.squads', squads.error);
      return {
        hunters: ((hunters.data ?? []) as ProfileRow[]).map(rowToLeaderboardHunter),
        squads: ((squads.data ?? []) as unknown as SquadRow[]).map(rowToSquad),
      };
    },

    async deleteAuthUser(authId) {
      // Hard delete (shouldSoftDelete = false). Also removes the user's sessions and
      // refresh tokens; already-issued access tokens stay valid until they expire,
      // but every API call then fails with 404 PROFILE_NOT_FOUND.
      const { error } = await db.auth.admin.deleteUser(authId, false);
      if (error && error.status !== 404) fail('deleteAuthUser', { message: error.message, code: error.code });
    },
  };
}
