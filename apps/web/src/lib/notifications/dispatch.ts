import {
  NOTIFICATION_KINDS,
  notificationContent,
  type NotificationCronResponse,
  type NotificationKind,
} from '@aurafit/shared';
import {
  EXPO_RECEIPTS_BATCH,
  EXPO_SEND_BATCH,
  getExpoReceipts,
  isDeviceNotRegistered,
  sendExpoBatch,
  type ExpoMessage,
} from './expo';
import type { ClaimedRecipient, NotificationRepository, PendingTicket } from './types';

/** Android channel created by the mobile app (apps/mobile/src/lib/push.ts). */
export const ANDROID_CHANNEL_ID = 'reminders';
/** Expo recommends checking receipts ~15 minutes after sending. */
export const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export interface RunOptions {
  repo: NotificationRepository;
  now: Date;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

/**
 * One cron tick:
 *   1. Check receipts of tickets sent >= 15 min ago; delete DeviceNotRegistered tokens.
 *   2. For each kind (STREAK_SAVER first, so DAILY_REMINDER can skip users it already
 *      reached): claim due users (ledger insert happens BEFORE sending, ON CONFLICT DO
 *      NOTHING, so a duplicate run claims nobody), send in batches of <= 100, record tickets,
 *      drop tokens whose ticket says DeviceNotRegistered, and release claims whose every
 *      message failed in transport (so a manual re-run in the same hour retries them).
 */
export async function runNotificationCron({ repo, now, accessToken, fetchImpl }: RunOptions): Promise<NotificationCronResponse> {
  const expo = { accessToken, fetchImpl };
  const deadTokens = new Set<string>();
  const result: NotificationCronResponse = {
    ranAt: now.toISOString(),
    kinds: { STREAK_SAVER: { claimed: 0, sent: 0, failed: 0 }, DAILY_REMINDER: { claimed: 0, sent: 0, failed: 0 } },
    messages: 0,
    tickets: { ok: 0, error: 0 },
    receiptsChecked: 0,
    tokensRemoved: 0,
  };

  // 1. Receipts from earlier runs.
  const pending = await repo.listPendingTickets(new Date(now.getTime() - RECEIPT_DELAY_MS), EXPO_RECEIPTS_BATCH);
  if (pending.length) {
    const receipts = await getExpoReceipts(
      pending.map((p) => p.ticketId),
      expo,
    );
    if (receipts.ok) {
      const settled: string[] = [];
      for (const p of pending) {
        const r = receipts.data[p.ticketId];
        if (!r) continue; // not ready yet; pruned after 2 days if it never appears
        settled.push(p.ticketId);
        if (isDeviceNotRegistered(r)) deadTokens.add(p.token);
        else if (r.status === 'error') console.warn('[cron/notifications] receipt error', r.details?.error ?? r.message);
      }
      result.receiptsChecked = settled.length;
      await repo.deleteTickets(settled);
    } else {
      console.warn('[cron/notifications] receipts request failed', receipts.status, receipts.error);
    }
  }

  // 2. Send.
  for (const kind of NOTIFICATION_KINDS) {
    await sendKind(kind);
  }

  if (deadTokens.size) {
    await repo.deleteTokens([...deadTokens]);
    result.tokensRemoved = deadTokens.size;
  }
  return result;

  async function sendKind(kind: NotificationKind) {
    const claims = await repo.claimDue(kind, now);
    const stats = result.kinds[kind];
    stats.claimed = claims.length;
    if (!claims.length) return;

    const items: { claim: ClaimedRecipient; message: ExpoMessage }[] = claims.flatMap((claim) => {
      const c = notificationContent(kind, claim.streakDays);
      return claim.tokens.map((to) => ({
        claim,
        message: { to, title: c.title, body: c.body, data: c.data, sound: 'default' as const, channelId: ANDROID_CHANNEL_ID, priority: 'high' as const },
      }));
    });
    result.messages += items.length;

    const delivered = new Set<string>(); // userId with >= 1 accepted ticket
    const transportFailed = new Set<string>(); // userId with >= 1 message in a failed batch
    const tickets: PendingTicket[] = [];

    for (let i = 0; i < items.length; i += EXPO_SEND_BATCH) {
      const batch = items.slice(i, i + EXPO_SEND_BATCH);
      const res = await sendExpoBatch(
        batch.map((b) => b.message),
        expo,
      );
      if (!res.ok) {
        console.error('[cron/notifications] Expo send failed', res.status, res.error);
        batch.forEach((b) => transportFailed.add(b.claim.userId));
        continue;
      }
      res.data.forEach((ticket, j) => {
        const { claim, message } = batch[j];
        if (ticket.status === 'ok') {
          result.tickets.ok += 1;
          delivered.add(claim.userId);
          if (ticket.id) tickets.push({ ticketId: ticket.id, token: message.to });
        } else {
          result.tickets.error += 1;
          if (isDeviceNotRegistered(ticket)) deadTokens.add(message.to);
          else console.warn('[cron/notifications] ticket error', ticket.details?.error ?? ticket.message);
        }
      });
    }

    if (tickets.length) await repo.recordTickets(tickets);

    const release = claims.filter((c) => !delivered.has(c.userId) && transportFailed.has(c.userId));
    if (release.length) await repo.releaseClaims(kind, release);
    stats.sent = delivered.size;
    stats.failed = claims.length - delivered.size;
  }
}
