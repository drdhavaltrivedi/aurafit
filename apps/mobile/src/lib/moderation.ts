/**
 * Pure moderation helpers for the app (no React Native imports; unit-tested in test/moderation.test.ts).
 */
import {
  AUDIT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  suspensionMessage,
  type AdminRecentLog,
  type AdminUserListItem,
  type AuditEntry,
  type FlaggedUser,
  type ModerationQueueItem,
  type ReportReason,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { isApiError } from '../api/client';

// ------------------------------------------
// Suspension
// ------------------------------------------

/** True for the server's 403 SUSPENDED (any mutating game endpoint while the account is suspended). */
export function isSuspendedError(err: unknown): boolean {
  return isApiError(err) && err.code === 'SUSPENDED';
}

/** Text for a SUSPENDED error: the server's message (it is suspensionMessage(reason)), else the generic one. */
export function suspendedErrorText(err: unknown): string {
  const msg = isApiError(err) ? err.message.trim() : '';
  return msg && !/^Request failed with status/.test(msg) ? msg : suspensionMessage(null);
}

type SuspendedListener = (message: string) => void;
const suspendedListeners = new Set<SuspendedListener>();

/** Subscribes to "an API call just got 403 SUSPENDED" (the suspension banner refreshes on it). */
export function onSuspendedError(listener: SuspendedListener): () => void {
  suspendedListeners.add(listener);
  return () => {
    suspendedListeners.delete(listener);
  };
}

/** Called by the app's error mapper when a request is rejected with SUSPENDED. */
export function notifySuspended(message: string): void {
  suspendedListeners.forEach((l) => {
    try {
      l(message);
    } catch {
      /* a listener must never break error handling */
    }
  });
}

// ------------------------------------------
// Reports
// ------------------------------------------

export const REPORT_REASON_OPTIONS: ReadonlyArray<{ value: ReportReason; label: string }> = REPORT_REASONS.map((value) => ({
  value,
  label: REPORT_REASON_LABELS[value],
}));

export const REPORT_SUCCESS_TEXT = 'Thanks. A moderator will review your report.';

/**
 * Outcome of a report submission (same rules as the web dialog): success, ALREADY_REPORTED counts as
 * done (toast the server's message), anything else stays in the sheet as an error.
 */
export function reportOutcome(err: unknown | null): { done: boolean; text: string } {
  if (err === null) return { done: true, text: REPORT_SUCCESS_TEXT };
  if (isApiError(err) && err.code === 'ALREADY_REPORTED') {
    return { done: true, text: err.message || 'You already reported this. A moderator will review it.' };
  }
  if (isSuspendedError(err)) return { done: false, text: suspendedErrorText(err) };
  if (isApiError(err) && err.code === 'CANNOT_REPORT_OWN') return { done: false, text: "You can't report your own content." };
  if (isApiError(err)) {
    if (err.code === 'NETWORK_ERROR') return { done: false, text: "Can't reach AuraFit. Check your connection." };
    if (err.code === 'TIMEOUT') return { done: false, text: 'The server took too long to respond.' };
    if (err.code === 'RATE_LIMITED') return { done: false, text: 'Slow down a little — try again in a moment.' };
    return { done: false, text: err.message };
  }
  return { done: false, text: 'Something went wrong.' };
}

/** Report action on a drop: signed in, not demo, and not the viewer's own drop. */
export function canReportDrop(drop: Pick<WorkoutDrop, 'creatorId'>, viewerId: string | null, demo: boolean): boolean {
  return !demo && !!viewerId && !!drop.creatorId && drop.creatorId !== viewerId;
}

/**
 * Report action on a listed squad: only once the viewer's own squad is known (`undefined` = still
 * loading), and never on their own squad.
 */
export function canReportSquad(squadId: string, mySquadId: string | null | undefined): boolean {
  return mySquadId !== undefined && !!squadId && squadId !== mySquadId;
}

// ------------------------------------------
// Admin console
// ------------------------------------------

/** "Spam or misleading ×2, Impersonation ×1" (most reported first). */
export function formatReasonCounts(counts: ModerationQueueItem['reasonCounts']): string {
  return (Object.entries(counts) as Array<[ReportReason, number | undefined]>)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([r, n]) => `${REPORT_REASON_LABELS[r] ?? r} ×${n}`)
    .join(', ');
}

/** Display name of a queue item's target. */
export function queueItemTitle(item: ModerationQueueItem): string {
  if (item.drop) return item.drop.title;
  if (item.squad) return `${item.squad.name} [${item.squad.tag}]`;
  return item.targetType === 'DROP' ? 'Deleted workout' : 'Deleted squad';
}

/** Stable list key of a queue item. */
export const queueItemKey = (item: Pick<ModerationQueueItem, 'targetType' | 'targetId'>) => `${item.targetType}:${item.targetId}`;

/** Suspend is offered only for non-admin, non-system accounts that are not already suspended. */
export function canSuspend(user: Pick<AdminUserListItem, 'role' | 'isSystem' | 'suspended'>): boolean {
  return !user.suspended && !user.isSystem && user.role !== 'ADMIN';
}

/** Role changes: never on system profiles or on yourself (the server rejects both). */
export function canChangeRole(user: Pick<AdminUserListItem, 'id' | 'isSystem'>, viewerId: string | null): boolean {
  return !user.isSystem && user.id !== viewerId;
}

/** Confirmation text for a role change. */
export function roleChangePrompt(handle: string, from: UserRole, to: UserRole): string {
  return `Change ${handle} from ${from} to ${to}? ${to === 'ADMIN' ? 'Admins get full moderation access.' : from === 'ADMIN' ? 'They lose moderation access.' : ''}`.trim();
}

/** Flag evidence rows as ledger rows (same shape the user detail shows). */
export function evidenceAsLogs(user: Pick<FlaggedUser, 'evidence'>): AdminRecentLog[] {
  return user.evidence.map((e) => ({
    kind: e.kind,
    id: e.logId,
    itemId: e.itemId,
    title: e.title,
    auraEarned: e.auraEarned,
    completedAt: e.completedAt,
    dateKey: '',
  }));
}

/** Label of an audit entry's action (falls back to the raw code for actions added later). */
export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/** The reason / note an admin gave for an audit entry, if any. */
export function auditReason(entry: Pick<AuditEntry, 'details'>): string | null {
  const d = entry.details ?? {};
  if (typeof d.reason === 'string' && d.reason) return d.reason;
  if (typeof d.note === 'string' && d.note) return d.note;
  return null;
}

/** "user", "quest log"... */
export function auditTargetLabel(targetType: string): string {
  return targetType.toLowerCase().replace(/_/g, ' ');
}

/** "Oct 15, 2026, 9:14 AM" style timestamp ('' for invalid input). */
export function when(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
