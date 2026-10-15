import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RepositoryError } from '@/lib/data/supabase-repository';
import { toAccountModeration, toAuditEntry, toFlaggedUser, toQueueItem, toUserListItem, toUserSummary } from './mappers';
import type { ModerationRepository } from './types';

type Json = Record<string, unknown> & { status: string };

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

function unexpected(operation: string, s: unknown): never {
  throw new RepositoryError(operation, { message: `unexpected status ${String(s)}` });
}

/** Calls one server-only SQL function and returns its jsonb result (must carry a `status`). */
async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Json> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new RepositoryError(fn, error);
  const r = (data ?? {}) as Json;
  if (typeof r.status !== 'string') unexpected(fn, r.status);
  return r;
}

/** Narrows `r.status` to one of `allowed`, or throws (a status the code does not know is a bug). */
function only<S extends string>(fn: string, r: Json, allowed: readonly S[]): { status: S } {
  if (!(allowed as readonly string[]).includes(r.status)) unexpected(fn, r.status);
  return { status: r.status as S };
}

/** ModerationRepository backed by Supabase using the secret (service_role) key. */
export function createSupabaseModerationRepository(db: SupabaseClient): ModerationRepository {
  return {
    async submitReport(reporterId, input) {
      const r = await rpc(db, 'submit_report', {
        p_reporter_id: reporterId,
        p_target_type: input.targetType,
        p_target_id: input.targetId,
        p_reason: input.reason,
        p_note: input.note ?? null,
      });
      if (r.status === 'created') return { status: 'created', reportId: String(r.report_id) };
      return only('submit_report', r, ['already_reported', 'target_not_found', 'cannot_report_own', 'profile_not_found', 'invalid'] as const);
    },

    async accountModeration(profileId) {
      const r = await rpc(db, 'get_account_moderation', { p_profile_id: profileId });
      if (r.status === 'profile_not_found') return null;
      if (r.status !== 'ok') unexpected('get_account_moderation', r.status);
      return toAccountModeration(r);
    },

    async queue(actorId, limit) {
      const r = await rpc(db, 'admin_moderation_queue', { p_actor_id: actorId, p_limit: limit });
      if (r.status === 'ok') {
        return { status: 'ok', queue: { totalTargets: num(r.total_targets), items: (Array.isArray(r.items) ? r.items : []).map(toQueueItem) } };
      }
      return only('admin_moderation_queue', r, ['forbidden'] as const);
    },

    async hideDrop(actorId, dropId, reason) {
      const r = await rpc(db, 'admin_hide_drop', { p_actor_id: actorId, p_drop_id: dropId, p_reason: reason });
      if (r.status === 'hidden') return { status: 'hidden', resolvedReports: num(r.resolved_reports) };
      return only('admin_hide_drop', r, ['already_hidden', 'not_found', 'invalid', 'forbidden'] as const);
    },

    async restoreDrop(actorId, dropId) {
      const r = await rpc(db, 'admin_restore_drop', { p_actor_id: actorId, p_drop_id: dropId });
      return only('admin_restore_drop', r, ['restored', 'not_hidden', 'not_found', 'forbidden'] as const);
    },

    async dismissReports(actorId, input) {
      const r = await rpc(db, 'admin_dismiss_reports', {
        p_actor_id: actorId,
        p_target_type: input.targetType,
        p_target_id: input.targetId,
        p_note: input.note ?? null,
      });
      if (r.status === 'dismissed') return { status: 'dismissed', count: num(r.count) };
      return only('admin_dismiss_reports', r, ['no_open_reports', 'invalid', 'forbidden'] as const);
    },

    async resetSquadName(actorId, squadId) {
      const r = await rpc(db, 'admin_reset_squad_name', { p_actor_id: actorId, p_squad_id: squadId });
      if (r.status === 'reset') {
        return { status: 'reset', name: String(r.name), previousName: String(r.previous_name), resolvedReports: num(r.resolved_reports) };
      }
      return only('admin_reset_squad_name', r, ['not_found', 'forbidden'] as const);
    },

    async setCreatorBadge(actorId, dropId, badge) {
      const r = await rpc(db, 'admin_set_creator_badge', { p_actor_id: actorId, p_drop_id: dropId, p_badge: badge });
      if (r.status === 'updated') return { status: 'updated', badge: String(r.badge) };
      return only('admin_set_creator_badge', r, ['not_found', 'not_verified_creator', 'invalid', 'forbidden'] as const);
    },

    async setRole(actorId, targetId, role) {
      const r = await rpc(db, 'admin_set_role', { p_actor_id: actorId, p_target_id: targetId, p_role: role });
      if (r.status === 'updated' || r.status === 'unchanged') return { status: r.status, role };
      return only('admin_set_role', r, ['not_found', 'cannot_change_self', 'last_admin', 'system_profile', 'forbidden'] as const);
    },

    async searchUsers(actorId, query, limit, after) {
      const r = await rpc(db, 'admin_search_users', { p_actor_id: actorId, p_query: query || null, p_limit: limit, p_after_handle: after });
      if (r.status === 'ok') {
        return {
          status: 'ok',
          page: {
            items: (Array.isArray(r.items) ? r.items : []).map(toUserListItem),
            nextAfter: typeof r.next_after === 'string' ? r.next_after : null,
          },
        };
      }
      return only('admin_search_users', r, ['forbidden'] as const);
    },

    async userSummary(actorId, targetId) {
      const r = await rpc(db, 'admin_user_summary', { p_actor_id: actorId, p_target_id: targetId });
      if (r.status === 'ok') return { status: 'ok', user: toUserSummary(r) };
      return only('admin_user_summary', r, ['not_found', 'forbidden'] as const);
    },

    async suspend(actorId, targetId, reason) {
      const r = await rpc(db, 'admin_suspend_user', { p_actor_id: actorId, p_target_id: targetId, p_reason: reason });
      return only('admin_suspend_user', r, [
        'suspended',
        'already_suspended',
        'not_found',
        'cannot_suspend_self',
        'cannot_suspend_admin',
        'system_profile',
        'invalid',
        'forbidden',
      ] as const);
    },

    async unsuspend(actorId, targetId) {
      const r = await rpc(db, 'admin_unsuspend_user', { p_actor_id: actorId, p_target_id: targetId });
      return only('admin_unsuspend_user', r, ['unsuspended', 'not_suspended', 'not_found', 'forbidden'] as const);
    },

    async flaggedUsers(actorId, t, now) {
      const r = await rpc(db, 'admin_flagged_users', {
        p_actor_id: actorId,
        p_now: now.toISOString(),
        p_burst_per_hour: t.burstPerHour,
        p_day_aura_min: t.dayAuraMin,
        p_day_aura_multiplier: t.dayAuraMultiplier,
        p_fast_ratio: t.fastRatio,
        p_fast_min_count: t.fastMinCount,
        p_lookback_days: t.lookbackDays,
      });
      if (r.status === 'ok') {
        return {
          status: 'ok',
          flags: {
            generatedAt: new Date(String(r.generated_at)).toISOString(),
            since: new Date(String(r.since)).toISOString(),
            items: (Array.isArray(r.items) ? r.items : []).map((i) => toFlaggedUser(i, t)),
          },
        };
      }
      return only('admin_flagged_users', r, ['forbidden'] as const);
    },

    async clearFlag(actorId, targetId, note) {
      const r = await rpc(db, 'admin_clear_flag', { p_actor_id: actorId, p_target_id: targetId, p_note: note ?? null });
      return only('admin_clear_flag', r, ['cleared', 'not_found', 'invalid', 'forbidden'] as const);
    },

    async revertLog(actorId, targetId, input) {
      const r = await rpc(db, 'admin_revert_log', {
        p_actor_id: actorId,
        p_target_id: targetId,
        p_kind: input.kind,
        p_log_id: input.logId,
        p_note: input.note ?? null,
      });
      if (r.status === 'reverted') {
        const profile = (r.profile ?? {}) as Record<string, unknown>;
        return { status: 'reverted', auraRemoved: num(r.aura_removed), auraPoints: num(profile.aura_points) };
      }
      return only('admin_revert_log', r, ['not_found', 'invalid', 'forbidden'] as const);
    },

    async auditEntries(actorId, f) {
      const r = await rpc(db, 'admin_audit_entries', {
        p_actor_id: actorId,
        p_action: f.action ?? null,
        p_target_type: f.targetType ?? null,
        p_target_id: f.targetId ?? null,
        p_limit: f.limit,
        p_before_created_at: f.before?.createdAt ?? null,
        p_before_id: f.before?.id ?? null,
      });
      if (r.status === 'ok') {
        const next = (r.next_before ?? null) as { created_at?: unknown; id?: unknown } | null;
        return {
          status: 'ok',
          page: {
            items: (Array.isArray(r.items) ? r.items : []).map(toAuditEntry),
            nextBefore: next && typeof next.id === 'string' ? { createdAt: String(next.created_at), id: next.id } : null,
          },
        };
      }
      return only('admin_audit_entries', r, ['forbidden'] as const);
    },
  };
}
