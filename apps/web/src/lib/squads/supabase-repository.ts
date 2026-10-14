import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SQUAD_ICON,
  getRankFromAura,
  RANK_ORDER,
  squadWeekWindow,
  toIconKey,
  type HunterRank,
  type SquadLeaderboardEntry,
  type SquadSnapshot,
} from '@aurafit/shared';
import { RepositoryError } from '@/lib/data/supabase-repository';
import type { SquadActivityResult, SquadRepository } from './types';

function fail(operation: string, error: { message?: string; code?: string } | null): never {
  throw new RepositoryError(operation, error);
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const iso = (v: unknown): string => {
  const d = new Date(String(v ?? ''));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rankOf = (v: unknown): HunterRank => ((RANK_ORDER as readonly string[]).includes(String(v)) ? (v as HunterRank) : getRankFromAura(0).rank);

type Json = Record<string, unknown>;

function status(raw: unknown, operation: string): Json & { status: string } {
  const r = (raw ?? {}) as Json;
  if (typeof r.status !== 'string') fail(operation, { message: 'missing status in result' });
  return r as Json & { status: string };
}

function unexpected(operation: string, s: string): never {
  throw new RepositoryError(operation, { message: `unexpected status ${s}` });
}

/** public.get_member_squad jsonb → SquadSnapshot. */
export function toSquadSnapshot(r: Json): SquadSnapshot {
  const s = (r.squad ?? {}) as Json;
  const members = Array.isArray(r.members) ? (r.members as Json[]) : [];
  return {
    weekStart: iso(r.week_start),
    weekEnd: iso(r.week_end),
    rank: r.rank === null || r.rank === undefined ? null : num(r.rank),
    squad: {
      id: str(s.id),
      name: str(s.name),
      tag: str(s.tag),
      icon: toIconKey(s.icon, DEFAULT_SQUAD_ICON),
      maxMembers: num(s.max_members) || 5,
      weeklyGoal: s.weekly_goal === null || s.weekly_goal === undefined ? null : num(s.weekly_goal),
      leaderId: typeof s.leader_id === 'string' ? s.leader_id : null,
      createdAt: iso(s.created_at),
      inviteCode: typeof s.invite_code === 'string' ? s.invite_code : null,
    },
    members: members.map((m) => ({
      profileId: str(m.profile_id),
      username: str(m.username),
      handle: str(m.handle),
      avatarUrl: str(m.avatar_url),
      rank: rankOf(m.rank),
      joinedAt: iso(m.joined_at),
      weeklyAura: num(m.weekly_aura),
    })),
  };
}

/** SquadRepository backed by Supabase with the secret (service_role) key. */
export function createSupabaseSquadRepository(db: SupabaseClient): SquadRepository {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) fail(fn, error);
    return status(data, fn);
  };

  return {
    async getMemberSquad(profileId, now) {
      const r = await rpc('get_member_squad', { p_profile_id: profileId, p_now: now.toISOString() });
      if (r.status === 'not_in_squad') return null;
      if (r.status !== 'ok') unexpected('get_member_squad', r.status);
      return toSquadSnapshot(r);
    },

    async createSquad(profileId, input) {
      const r = await rpc('create_squad', { p_profile_id: profileId, p_name: input.name, p_tag: input.tag, p_icon: input.icon });
      switch (r.status) {
        case 'created':
        case 'already_in_squad':
        case 'name_taken':
        case 'tag_taken':
        case 'profile_not_found':
          return { status: r.status };
        default:
          return unexpected('create_squad', r.status);
      }
    },

    async joinSquad(profileId, code) {
      const r = await rpc('join_squad', { p_profile_id: profileId, p_code: code });
      switch (r.status) {
        case 'joined':
        case 'invalid_code':
        case 'already_in_squad':
        case 'full':
        case 'profile_not_found':
          return { status: r.status };
        default:
          return unexpected('join_squad', r.status);
      }
    },

    async leaveSquad(profileId) {
      const r = await rpc('leave_squad', { p_profile_id: profileId });
      if (r.status === 'left') return { status: 'left', squadDeleted: r.squad_deleted === true };
      if (r.status === 'not_in_squad' || r.status === 'profile_not_found') return { status: r.status };
      return unexpected('leave_squad', r.status);
    },

    async removeMember(actorId, targetId) {
      const r = await rpc('remove_squad_member', { p_actor_id: actorId, p_target_id: targetId });
      switch (r.status) {
        case 'removed':
        case 'not_in_squad':
        case 'not_leader':
        case 'member_not_found':
        case 'cannot_remove_self':
          return { status: r.status };
        default:
          return unexpected('remove_squad_member', r.status);
      }
    },

    async regenerateInviteCode(actorId) {
      const r = await rpc('regenerate_squad_invite_code', { p_actor_id: actorId });
      if (r.status === 'regenerated' && typeof r.invite_code === 'string') return { status: 'regenerated', inviteCode: r.invite_code };
      if (r.status === 'not_in_squad' || r.status === 'not_leader') return { status: r.status };
      return unexpected('regenerate_squad_invite_code', r.status);
    },

    async updateSquad(actorId, patch) {
      const p: Record<string, unknown> = {};
      if (patch.name !== undefined) p.name = patch.name;
      if (patch.icon !== undefined) p.icon = patch.icon;
      if (patch.weeklyGoal !== undefined) p.weekly_goal = patch.weeklyGoal;
      const r = await rpc('update_squad', { p_actor_id: actorId, p_patch: p });
      switch (r.status) {
        case 'updated':
        case 'not_in_squad':
        case 'not_leader':
        case 'name_taken':
          return { status: r.status };
        default:
          return unexpected('update_squad', r.status);
      }
    },

    async leaderboard(limit, now) {
      const { data, error } = await db.rpc('squad_leaderboard', { p_limit: limit, p_now: now.toISOString() });
      if (error) fail('squad_leaderboard', error);
      const rows = (data ?? []) as Json[];
      const window = squadWeekWindow(now);
      return {
        week: { start: rows[0] ? iso(rows[0].week_start) : window.start.toISOString(), end: window.end.toISOString() },
        squads: rows.map(
          (r): SquadLeaderboardEntry => ({
            rank: num(r.rank),
            id: str(r.squad_id),
            name: str(r.name),
            tag: str(r.tag),
            icon: toIconKey(r.icon, DEFAULT_SQUAD_ICON),
            memberCount: num(r.member_count),
            maxMembers: num(r.max_members) || 5,
            weeklyAura: num(r.weekly_aura),
          }),
        ),
      };
    },

    async activity(profileId, limit, now): Promise<SquadActivityResult> {
      const r = await rpc('squad_activity', { p_profile_id: profileId, p_limit: limit, p_now: now.toISOString() });
      if (r.status === 'not_in_squad') return { status: 'not_in_squad' };
      if (r.status !== 'ok') unexpected('squad_activity', r.status);
      const items = Array.isArray(r.items) ? (r.items as Json[]) : [];
      return {
        status: 'ok',
        weekStart: iso(r.week_start),
        items: items.map((i) => ({
          id: str(i.id),
          kind: i.kind === 'WORKOUT' ? 'WORKOUT' : 'QUEST',
          profileId: str(i.profile_id),
          username: str(i.username),
          handle: str(i.handle),
          title: str(i.title),
          aura: num(i.aura),
          completedAt: iso(i.completed_at),
        })),
      };
    },
  };
}
