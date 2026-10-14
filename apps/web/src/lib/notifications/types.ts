import type { NotificationKind, NotificationSettings, PushPlatform } from '@aurafit/shared';

/** A user claimed for one notification kind by public.claim_due_notifications. */
export interface ClaimedRecipient {
  /** profiles.id */
  userId: string;
  /** User's local date (YYYY-MM-DD) the claim was recorded under. */
  localDate: string;
  streakDays: number;
  tokens: string[];
}

export interface PendingTicket {
  ticketId: string;
  token: string;
}

/**
 * Database access for notifications (settings, push tokens, idempotency ledger, ticket
 * receipts). Separate from GameRepository so the routes and the cron runner can be tested
 * with an in-memory fake.
 */
export interface NotificationRepository {
  getSettings(userId: string): Promise<NotificationSettings | null>;
  saveSettings(userId: string, settings: NotificationSettings): Promise<NotificationSettings>;
  /** Insert or move the token to `userId` (a device belongs to whoever registered it last). */
  upsertPushToken(userId: string, token: string, platform: PushPlatform): Promise<void>;
  /** Deletes the token only if it belongs to `userId`. */
  deletePushToken(userId: string, token: string): Promise<void>;
  /** Selects due recipients for `now` and records them in notification_log (idempotent). */
  claimDue(kind: NotificationKind, now: Date): Promise<ClaimedRecipient[]>;
  /** Undo claims whose push never reached Expo, so a re-run in the same hour retries them. */
  releaseClaims(kind: NotificationKind, claims: ReadonlyArray<Pick<ClaimedRecipient, 'userId' | 'localDate'>>): Promise<void>;
  /** Removes tokens Expo reported as DeviceNotRegistered (any owner). */
  deleteTokens(tokens: readonly string[]): Promise<void>;
  recordTickets(tickets: readonly PendingTicket[]): Promise<void>;
  /** Tickets created before `olderThan` (receipts are ready ~15 min after sending), oldest first. */
  listPendingTickets(olderThan: Date, limit: number): Promise<PendingTicket[]>;
  deleteTickets(ticketIds: readonly string[]): Promise<void>;
}
