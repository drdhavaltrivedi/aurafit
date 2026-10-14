import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@aurafit/shared';
import { RepositoryError } from '@/lib/data/supabase-repository';
import type { ClaimedRecipient, NotificationRepository, PendingTicket } from './types';

interface SettingsRow {
  timezone: string;
  streak_saver: boolean;
  daily_reminder_hour: number | null;
}

interface ClaimRow {
  user_id: string;
  local_date: string;
  streak_days: number;
  tokens: string[] | null;
}

function fail(operation: string, error: { message?: string; code?: string } | null): never {
  throw new RepositoryError(operation, error);
}

const toSettings = (r: SettingsRow): NotificationSettings => ({
  timezone: r.timezone || DEFAULT_NOTIFICATION_SETTINGS.timezone,
  streakSaver: r.streak_saver,
  dailyReminderHour: r.daily_reminder_hour,
});

/** Chunks for `.in()` filters (keeps PostgREST URLs short). */
function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** NotificationRepository backed by Supabase with the secret (service_role) key. */
export function createSupabaseNotificationRepository(db: SupabaseClient): NotificationRepository {
  return {
    async getSettings(userId) {
      const { data, error } = await db
        .from('notification_settings')
        .select('timezone, streak_saver, daily_reminder_hour')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail('getSettings', error);
      return data ? toSettings(data as SettingsRow) : null;
    },

    async saveSettings(userId, s) {
      const { data, error } = await db
        .from('notification_settings')
        .upsert(
          { user_id: userId, timezone: s.timezone, streak_saver: s.streakSaver, daily_reminder_hour: s.dailyReminderHour },
          { onConflict: 'user_id' },
        )
        .select('timezone, streak_saver, daily_reminder_hour')
        .single();
      if (error) fail('saveSettings', error);
      return toSettings(data as SettingsRow);
    },

    async upsertPushToken(userId, token, platform) {
      const { error } = await db
        .from('push_tokens')
        .upsert({ user_id: userId, token, platform, last_seen_at: new Date().toISOString() }, { onConflict: 'token' });
      if (error) fail('upsertPushToken', error);
    },

    async deletePushToken(userId, token) {
      const { error } = await db.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
      if (error) fail('deletePushToken', error);
    },

    async claimDue(kind, now) {
      const { data, error } = await db.rpc('claim_due_notifications', { p_kind: kind, p_now: now.toISOString() });
      if (error) fail('claim_due_notifications', error);
      return ((data ?? []) as ClaimRow[]).map(
        (r): ClaimedRecipient => ({
          userId: r.user_id,
          localDate: String(r.local_date).slice(0, 10),
          streakDays: Number(r.streak_days) || 0,
          tokens: r.tokens ?? [],
        }),
      );
    },

    async releaseClaims(kind, claims) {
      if (!claims.length) return;
      const { error } = await db.rpc('release_notification_claims', {
        p_kind: kind,
        p_user_ids: claims.map((c) => c.userId),
        p_local_dates: claims.map((c) => c.localDate),
      });
      if (error) fail('release_notification_claims', error);
    },

    async deleteTokens(tokens) {
      for (const part of chunks(tokens, 100)) {
        const { error } = await db.from('push_tokens').delete().in('token', part);
        if (error) fail('deleteTokens', error);
      }
    },

    async recordTickets(tickets) {
      for (const part of chunks(tickets, 500)) {
        const { error } = await db
          .from('push_tickets')
          .upsert(part.map((t) => ({ ticket_id: t.ticketId, token: t.token })), { onConflict: 'ticket_id', ignoreDuplicates: true });
        if (error) fail('recordTickets', error);
      }
    },

    async listPendingTickets(olderThan, limit) {
      const { data, error } = await db
        .from('push_tickets')
        .select('ticket_id, token')
        .lt('created_at', olderThan.toISOString())
        .order('created_at')
        .limit(limit);
      if (error) fail('listPendingTickets', error);
      return ((data ?? []) as { ticket_id: string; token: string }[]).map((r): PendingTicket => ({ ticketId: r.ticket_id, token: r.token }));
    },

    async deleteTickets(ticketIds) {
      for (const part of chunks(ticketIds, 100)) {
        const { error } = await db.from('push_tickets').delete().in('ticket_id', part);
        if (error) fail('deleteTickets', error);
      }
    },
  };
}
