/** In-memory NotificationRepository for route / cron tests (not a test file itself). */
import type { NotificationKind, NotificationSettings, PushPlatform } from '@aurafit/shared';
import type { ClaimedRecipient, NotificationRepository, PendingTicket } from '@/lib/notifications/types';

export class FakeNotificationRepo implements NotificationRepository {
  settings = new Map<string, NotificationSettings>();
  tokens = new Map<string, { userId: string; platform: PushPlatform }>();
  /** Recipients that become due; claimDue applies the ledger like the SQL function. */
  due: Record<NotificationKind, Omit<ClaimedRecipient, 'tokens'>[]> = { STREAK_SAVER: [], DAILY_REMINDER: [] };
  ledger = new Set<string>();
  tickets: (PendingTicket & { createdAt: Date })[] = [];
  released: { kind: NotificationKind; userId: string; localDate: string }[] = [];
  failWith: Error | null = null;

  private guard() {
    if (this.failWith) throw this.failWith;
  }

  async getSettings(userId: string) {
    this.guard();
    return this.settings.get(userId) ?? null;
  }
  async saveSettings(userId: string, s: NotificationSettings) {
    this.guard();
    this.settings.set(userId, { ...s });
    return { ...s };
  }
  async upsertPushToken(userId: string, token: string, platform: PushPlatform) {
    this.guard();
    this.tokens.set(token, { userId, platform });
  }
  async deletePushToken(userId: string, token: string) {
    this.guard();
    if (this.tokens.get(token)?.userId === userId) this.tokens.delete(token);
  }
  async claimDue(kind: NotificationKind): Promise<ClaimedRecipient[]> {
    this.guard();
    const out: ClaimedRecipient[] = [];
    for (const d of this.due[kind]) {
      const key = `${d.userId}|${kind}|${d.localDate}`;
      const tokens = [...this.tokens].filter(([, v]) => v.userId === d.userId).map(([t]) => t).sort();
      if (this.ledger.has(key) || tokens.length === 0) continue;
      this.ledger.add(key);
      out.push({ ...d, tokens });
    }
    return out;
  }
  async releaseClaims(kind: NotificationKind, claims: ReadonlyArray<Pick<ClaimedRecipient, 'userId' | 'localDate'>>) {
    for (const c of claims) {
      this.ledger.delete(`${c.userId}|${kind}|${c.localDate}`);
      this.released.push({ kind, userId: c.userId, localDate: c.localDate });
    }
  }
  async deleteTokens(tokens: readonly string[]) {
    tokens.forEach((t) => this.tokens.delete(t));
  }
  async recordTickets(tickets: readonly PendingTicket[]) {
    tickets.forEach((t) => this.tickets.push({ ...t, createdAt: new Date() }));
  }
  async listPendingTickets(olderThan: Date, limit: number) {
    return this.tickets
      .filter((t) => t.createdAt < olderThan)
      .slice(0, limit)
      .map(({ ticketId, token }) => ({ ticketId, token }));
  }
  async deleteTickets(ids: readonly string[]) {
    this.tickets = this.tickets.filter((t) => !ids.includes(t.ticketId));
  }
}
