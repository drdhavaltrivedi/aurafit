// ==========================================
// ADMIN MODERATION — shared contract
// Implemented by apps/web/src/app/api/v1/reports, /api/v1/me/moderation and /api/v1/admin/** on
// top of the server-only SQL functions in supabase/migrations/20261014140000_moderation.sql;
// consumed by the web arena (AdminConsole, report dialogs) and the Expo app (AdminScreen, report
// sheet).
//
// Rules (mirrored by CHECK constraints / functions in the migration):
//   * Any signed-in, non-suspended user can report a workout drop or a squad: one OPEN report per
//     (reporter, target); not their own drop / squad. Reporter identities are never returned by
//     any endpoint (not to the creator, not to admins).
//   * Every /api/v1/admin/** route checks the ADMIN role read from the database (profiles.role via
//     the secret key), never JWT claims or user_metadata; every SQL admin_* function re-checks it.
//   * Every admin action writes an admin_audit_log row in the same transaction. The log is
//     append-only (retention >= 365 days).
//   * Hidden drops disappear from every public listing; their creator sees them as
//     "Hidden by moderator: <reason>".
//   * Suspended users get 403 SUSPENDED on mutating game endpoints (quests, workouts, drops,
//     squads, reports) and see a banner. Admins cannot be suspended; the last ADMIN cannot be
//     demoted; nobody can change their own role.
// ==========================================
import type { ApiErrorCode } from './api';
import type { HunterRank, UserRole } from './index';
import type { ValidationResult } from './notifications';

// ------------------------------------------
// Constants
// ------------------------------------------

export const REPORT_TARGET_TYPES = ['DROP', 'SQUAD'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = ['SPAM', 'INAPPROPRIATE', 'UNSAFE_EXERCISE', 'IMPERSONATION', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam or misleading',
  INAPPROPRIATE: 'Inappropriate or offensive',
  UNSAFE_EXERCISE: 'Unsafe exercise advice',
  IMPERSONATION: 'Impersonation',
  OTHER: 'Something else',
};

/** Optional report note; also the max length of admin reasons / notes. */
export const MODERATION_NOTE_MAX_LENGTH = 500;
/** Max length of drop.creator_badge (DB: VARCHAR(50)). */
export const MODERATION_BADGE_MAX_LENGTH = 50;
/** Badge used when an admin resets a creator badge (the column default). */
export const MODERATION_DEFAULT_BADGE = 'Verified Creator';

export const DROP_MODERATION_STATUSES = ['PUBLISHED', 'HIDDEN'] as const;
export type DropModerationStatus = (typeof DROP_MODERATION_STATUSES)[number];

export const ADMIN_ROLE_OPTIONS: readonly UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'];

export const ADMIN_USERS_PAGE_SIZE = 20;
export const ADMIN_AUDIT_PAGE_SIZE = 50;
export const ADMIN_QUEUE_LIMIT = 50;

export const AUDIT_ACTIONS = [
  'DROP_HIDDEN',
  'DROP_RESTORED',
  'REPORTS_DISMISSED',
  'SQUAD_NAME_RESET',
  'CREATOR_BADGE_SET',
  'ROLE_CHANGED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'FLAG_CLEARED',
  'AURA_REVERTED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  DROP_HIDDEN: 'Drop hidden',
  DROP_RESTORED: 'Drop restored',
  REPORTS_DISMISSED: 'Reports dismissed',
  SQUAD_NAME_RESET: 'Squad name reset',
  CREATOR_BADGE_SET: 'Creator badge changed',
  ROLE_CHANGED: 'Role changed',
  USER_SUSPENDED: 'User suspended',
  USER_UNSUSPENDED: 'User unsuspended',
  FLAG_CLEARED: 'Flag cleared',
  AURA_REVERTED: 'Aura reverted',
};

export const AUDIT_TARGET_TYPES = ['DROP', 'SQUAD', 'USER', 'QUEST_LOG', 'WORKOUT_LOG'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export type LedgerKind = 'QUEST' | 'WORKOUT';

// ------------------------------------------
// Suspicious aura flags
// ------------------------------------------

export interface AuraFlagThresholds {
  /** Flag when MORE than this many quest+workout completions fall in any 60-minute window. */
  burstPerHour: number;
  /** Today's (UTC) aura must reach this before a day spike is considered... */
  dayAuraMin: number;
  /** ...and be at least this multiple of the user's typical day (when a baseline exists). */
  dayAuraMultiplier: number;
  /** A workout is "too fast" when it finished less than duration x ratio after the previous completion. */
  fastRatio: number;
  /** Flag when at least this many workouts were too fast. */
  fastMinCount: number;
  /** Days of activity considered (1-30). */
  lookbackDays: number;
  /** A typical-day baseline needs this many active days in the previous 14 UTC days (SQL: fixed 3). */
  baselineMinDays: number;
}

/** Server defaults (configurable here; passed to public.admin_flagged_users by the API). */
export const AURA_FLAG_DEFAULTS: Readonly<AuraFlagThresholds> = Object.freeze({
  burstPerHour: 6,
  dayAuraMin: 4000,
  dayAuraMultiplier: 4,
  fastRatio: 0.5,
  fastMinCount: 3,
  lookbackDays: 7,
  baselineMinDays: 3,
});

export type AuraFlagKind = 'BURST' | 'DAY_SPIKE' | 'TOO_FAST';

export const AURA_FLAG_LABELS: Record<AuraFlagKind, string> = {
  BURST: 'Burst of completions',
  DAY_SPIKE: 'Aura spike today',
  TOO_FAST: 'Workouts faster than possible',
};

/** Per-user numbers computed by the server (camelCase of admin_flagged_users().metrics). */
export interface AuraFlagMetrics {
  completions: number;
  maxPerHour: number;
  burstWindowStart: string | null;
  todayAura: number;
  /** Average aura per active day over the previous 14 UTC days, or null without a baseline. */
  typicalDailyAura: number | null;
  baselineDays: number;
  fastCount: number;
}

/**
 * Which flags apply to `m` under `t`. Same rules as public.admin_flagged_users (kept in sync by
 * packages/shared/test/moderation-db.test.ts).
 */
export function auraFlagKinds(m: AuraFlagMetrics, t: AuraFlagThresholds = AURA_FLAG_DEFAULTS): AuraFlagKind[] {
  const kinds: AuraFlagKind[] = [];
  if (m.maxPerHour > t.burstPerHour) kinds.push('BURST');
  const hasBaseline = m.typicalDailyAura !== null && m.baselineDays >= t.baselineMinDays;
  if (m.todayAura >= t.dayAuraMin && (!hasBaseline || m.todayAura >= (m.typicalDailyAura as number) * t.dayAuraMultiplier)) {
    kinds.push('DAY_SPIKE');
  }
  if (m.fastCount >= t.fastMinCount) kinds.push('TOO_FAST');
  return kinds;
}

/** One-line human explanations for the admin UI. */
export function describeAuraFlags(m: AuraFlagMetrics, t: AuraFlagThresholds = AURA_FLAG_DEFAULTS): string[] {
  const n = (v: number) => v.toLocaleString('en-US');
  return auraFlagKinds(m, t).map((k) => {
    switch (k) {
      case 'BURST':
        return `${m.maxPerHour} completions within one hour (limit ${t.burstPerHour}).`;
      case 'DAY_SPIKE':
        return m.typicalDailyAura !== null && m.baselineDays >= t.baselineMinDays
          ? `${n(m.todayAura)} aura today, ${Math.round((m.todayAura / Math.max(1, m.typicalDailyAura)) * 10) / 10}x a typical day (${n(m.typicalDailyAura)}).`
          : `${n(m.todayAura)} aura today with no history to compare (threshold ${n(t.dayAuraMin)}).`;
      case 'TOO_FAST':
        return `${m.fastCount} workouts finished faster than ${Math.round(t.fastRatio * 100)}% of their duration.`;
    }
  });
}

/** Validates threshold overrides (all fields required, sane ranges). */
export function validateAuraFlagThresholds(input: unknown): ValidationResult<AuraFlagThresholds> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Thresholds must be an object.' } };
  const fieldErrors: Record<string, string> = {};
  const int = (k: keyof AuraFlagThresholds, min: number, max: number) => {
    const v = input[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fieldErrors[k] = `${k} must be a whole number from ${min} to ${max}.`;
  };
  const num = (k: keyof AuraFlagThresholds, min: number, max: number) => {
    const v = input[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fieldErrors[k] = `${k} must be a number from ${min} to ${max}.`;
  };
  int('burstPerHour', 1, 100);
  int('dayAuraMin', 0, 100_000);
  num('dayAuraMultiplier', 1, 100);
  num('fastRatio', 0.05, 1);
  int('fastMinCount', 1, 100);
  int('lookbackDays', 1, 30);
  int('baselineMinDays', 1, 14);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: input as unknown as AuraFlagThresholds };
}

// ------------------------------------------
// Routes + errors
// ------------------------------------------

export const MODERATION_ROUTES = {
  /**
   * POST (auth) CreateReportRequest → 201 CreateReportResponse
   *   | 400 VALIDATION_FAILED | 400 CANNOT_REPORT_OWN | 403 SUSPENDED | 404 NOT_FOUND | 409 ALREADY_REPORTED | 429
   */
  reports: '/api/v1/reports',
  /** GET (auth) → AccountModerationResponse (own suspension + own hidden drops). */
  me: '/api/v1/me/moderation',
} as const;

/** Every route: auth + ADMIN role from the database (403 FORBIDDEN otherwise), Cache-Control: no-store. */
export const ADMIN_ROUTES = {
  /** GET ?limit → ModerationQueueResponse */
  reports: '/api/v1/admin/reports',
  /** POST DismissReportsRequest → DismissReportsResponse | 404 NO_OPEN_REPORTS */
  dismissReports: '/api/v1/admin/reports/dismiss',
  /** POST HideDropRequest → AdminActionResponse | 404 | 409 ALREADY_HIDDEN */
  hideDrop: (dropId: string) => `/api/v1/admin/drops/${encodeURIComponent(dropId)}/hide`,
  /** POST (no body) → AdminActionResponse | 404 | 409 NOT_HIDDEN */
  restoreDrop: (dropId: string) => `/api/v1/admin/drops/${encodeURIComponent(dropId)}/restore`,
  /** PUT SetCreatorBadgeRequest → SetCreatorBadgeResponse | 404 | 409 NOT_VERIFIED_CREATOR */
  dropBadge: (dropId: string) => `/api/v1/admin/drops/${encodeURIComponent(dropId)}/badge`,
  /** POST (no body) → ResetSquadNameResponse | 404 */
  resetSquadName: (squadId: string) => `/api/v1/admin/squads/${encodeURIComponent(squadId)}/reset-name`,
  /** GET → FlaggedUsersResponse */
  flags: '/api/v1/admin/flags',
  /** GET ?q&after → AdminUsersResponse */
  users: '/api/v1/admin/users',
  /** GET → AdminUserSummaryResponse | 404 */
  user: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}`,
  /** PUT SetRoleRequest → SetRoleResponse | 400 CANNOT_CHANGE_OWN_ROLE | 404 | 409 LAST_ADMIN / SYSTEM_PROFILE */
  userRole: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}/role`,
  /** POST SuspendUserRequest → AdminActionResponse | 400 CANNOT_SUSPEND_SELF | 404 | 409 ALREADY_SUSPENDED / CANNOT_SUSPEND_ADMIN */
  suspend: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}/suspend`,
  /** POST (no body) → AdminActionResponse | 404 | 409 NOT_SUSPENDED */
  unsuspend: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}/unsuspend`,
  /** POST ClearFlagRequest → AdminActionResponse | 404 */
  clearFlag: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}/clear-flag`,
  /** POST RevertLogRequest → RevertLogResponse | 404 LOG_NOT_FOUND */
  revert: (profileId: string) => `/api/v1/admin/users/${encodeURIComponent(profileId)}/revert`,
  /** GET ?action&targetType&targetId&before&beforeId → AuditLogResponse */
  audit: '/api/v1/admin/audit',
} as const;

export type ModerationErrorCode =
  | 'SUSPENDED' // 403: the account is suspended (mutating game endpoints)
  | 'ALREADY_REPORTED' // 409: the caller already has an open report on this target
  | 'CANNOT_REPORT_OWN' // 400: own drop / own squad
  | 'ALREADY_HIDDEN' // 409
  | 'NOT_HIDDEN' // 409
  | 'NO_OPEN_REPORTS' // 404
  | 'NOT_VERIFIED_CREATOR' // 409: badge only for drops by CREATOR / ADMIN profiles
  | 'CANNOT_CHANGE_OWN_ROLE' // 400
  | 'LAST_ADMIN' // 409: at least one ADMIN must remain
  | 'SYSTEM_PROFILE' // 409: system profiles (auth_id NULL, e.g. @aurafit) cannot be changed
  | 'ALREADY_SUSPENDED' // 409
  | 'NOT_SUSPENDED' // 409
  | 'CANNOT_SUSPEND_SELF' // 400
  | 'CANNOT_SUSPEND_ADMIN' // 409: demote first
  | 'LOG_NOT_FOUND'; // 404: no such ledger row for this user

export interface ModerationApiError {
  error: string;
  code: ApiErrorCode | ModerationErrorCode;
  details?: string[];
  fieldErrors?: Record<string, string>;
}

// ------------------------------------------
// User-facing payloads
// ------------------------------------------

/** POST /api/v1/reports */
export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  /** Optional, <= MODERATION_NOTE_MAX_LENGTH chars. */
  note?: string;
}

export interface CreateReportResponse {
  report: { id: string; status: 'OPEN' };
}

/** A drop of the caller's that a moderator hid. */
export interface HiddenDropNotice {
  id: string;
  title: string;
  hiddenReason: string;
  hiddenAt: string;
}

/** GET /api/v1/me/moderation */
export interface AccountModerationResponse {
  suspended: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  hiddenDrops: HiddenDropNotice[];
}

/** Label the creator sees on a hidden drop. */
export function hiddenByModeratorLabel(reason: string): string {
  return `Hidden by moderator: ${reason}`;
}

/** Banner text for a suspended account. */
export function suspensionMessage(reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  return `Your account is suspended${r ? `: ${r}` : ''}. You can still browse, but quests, workouts, drops, squads and reports are paused. Contact support if you think this is a mistake.`;
}

// ------------------------------------------
// Admin payloads
// ------------------------------------------

export interface ReportedDropPreview {
  id: string;
  title: string;
  tagline: string;
  vibeTag: string;
  creatorId: string;
  creatorHandle: string;
  creatorName: string;
  creatorBadge: string;
  moderationStatus: DropModerationStatus;
  hiddenReason: string | null;
}

export interface ReportedSquadPreview {
  id: string;
  name: string;
  tag: string;
  icon: string;
  memberCount: number;
}

export interface ModerationQueueItem {
  targetType: ReportTargetType;
  targetId: string;
  openCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  reasonCounts: Partial<Record<ReportReason, number>>;
  /** Newest first, at most 5. No reporter identities. */
  latest: Array<{ reason: ReportReason; note: string | null; createdAt: string }>;
  /** null when the target no longer exists. */
  drop: ReportedDropPreview | null;
  squad: ReportedSquadPreview | null;
}

/** GET /api/v1/admin/reports */
export interface ModerationQueueResponse {
  totalTargets: number;
  items: ModerationQueueItem[];
}

/** POST /api/v1/admin/reports/dismiss */
export interface DismissReportsRequest {
  targetType: ReportTargetType;
  targetId: string;
  note?: string;
}
export interface DismissReportsResponse {
  dismissed: number;
}

/** POST /api/v1/admin/drops/{id}/hide */
export interface HideDropRequest {
  reason: string;
}

/** PUT /api/v1/admin/drops/{id}/badge (`null` resets to MODERATION_DEFAULT_BADGE). */
export interface SetCreatorBadgeRequest {
  badge: string | null;
}
export interface SetCreatorBadgeResponse {
  badge: string;
}

export interface ResetSquadNameResponse {
  name: string;
  previousName: string;
}

/** Generic success body of admin actions. */
export interface AdminActionResponse {
  ok: true;
  /** Reports resolved as a side effect (hide drop / reset squad name). */
  resolvedReports?: number;
}

export interface FlagEvidenceEntry {
  kind: LedgerKind;
  logId: string;
  itemId: string | null;
  title: string;
  auraEarned: number;
  completedAt: string;
  durationMinutes: number | null;
  secondsSincePrevious: number | null;
  tooFast: boolean;
}

export interface FlaggedUser {
  profileId: string;
  handle: string;
  username: string;
  role: UserRole;
  auraPoints: number;
  suspended: boolean;
  flagsClearedAt: string | null;
  flags: AuraFlagKind[];
  metrics: AuraFlagMetrics;
  /** Human-readable reasons (describeAuraFlags). */
  reasons: string[];
  /** Newest first, at most 25 completions from the lookback window. */
  evidence: FlagEvidenceEntry[];
}

/** GET /api/v1/admin/flags */
export interface FlaggedUsersResponse {
  generatedAt: string;
  since: string;
  thresholds: AuraFlagThresholds;
  items: FlaggedUser[];
}

export interface AdminUserListItem {
  id: string;
  handle: string;
  username: string;
  avatarUrl: string;
  role: UserRole;
  rank: HunterRank;
  auraPoints: number;
  createdAt: string;
  suspended: boolean;
  /** System profiles (auth_id NULL, e.g. @aurafit) cannot sign in and cannot be changed. */
  isSystem: boolean;
}

/** GET /api/v1/admin/users?q=&after= */
export interface AdminUsersResponse {
  items: AdminUserListItem[];
  /** Pass as `after` for the next page; null on the last page. */
  nextAfter: string | null;
}

export interface AdminRecentLog {
  kind: LedgerKind;
  id: string;
  itemId: string | null;
  title: string;
  auraEarned: number;
  completedAt: string;
  dateKey: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorHandle: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminUserSummary {
  profile: AdminUserListItem & {
    weeklyAuraGained: number;
    streakDays: number;
    totalWorkouts: number;
    suspendedAt: string | null;
    suspensionReason: string | null;
    flagsClearedAt: string | null;
    attributes: { str: number; agi: number; end: number; rec: number };
  };
  counts: { questLogs: number; workoutLogs: number; drops: number; hiddenDrops: number; openReportsOnDrops: number };
  recentLogs: AdminRecentLog[];
  audit: AuditEntry[];
}

/** GET /api/v1/admin/users/{id} */
export interface AdminUserSummaryResponse {
  user: AdminUserSummary;
}

/** PUT /api/v1/admin/users/{id}/role */
export interface SetRoleRequest {
  role: UserRole;
}
export interface SetRoleResponse {
  role: UserRole;
  changed: boolean;
}

/** POST /api/v1/admin/users/{id}/suspend */
export interface SuspendUserRequest {
  reason: string;
}

/** POST /api/v1/admin/users/{id}/clear-flag */
export interface ClearFlagRequest {
  note?: string;
}

/** POST /api/v1/admin/users/{id}/revert */
export interface RevertLogRequest {
  kind: LedgerKind;
  logId: string;
  note?: string;
}
export interface RevertLogResponse {
  auraRemoved: number;
  auraPoints: number;
}

/** GET /api/v1/admin/audit */
export interface AuditLogResponse {
  items: AuditEntry[];
  /** Cursor for the next (older) page; null on the last page. */
  nextBefore: { createdAt: string; id: string } | null;
}

// ------------------------------------------
// Validation (requests)
// ------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DROP_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}
export function isReportTargetType(value: unknown): value is ReportTargetType {
  return typeof value === 'string' && (REPORT_TARGET_TYPES as readonly string[]).includes(value);
}
export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value);
}
export function isAuditTargetType(value: unknown): value is AuditTargetType {
  return typeof value === 'string' && (AUDIT_TARGET_TYPES as readonly string[]).includes(value);
}

/** Trims and collapses whitespace; '' when not a string. */
export function normalizeModerationText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/** A target id valid for its type (drop ids: letters, digits, _ and -; squads: lowercase UUIDs). */
export function isValidReportTargetId(type: ReportTargetType, id: unknown): id is string {
  return type === 'SQUAD' ? isUuid(id) : typeof id === 'string' && DROP_ID_PATTERN.test(id);
}

function optionalNote(input: Record<string, unknown>, key: string, fieldErrors: Record<string, string>): string | undefined {
  if (input[key] === undefined || input[key] === null) return undefined;
  if (typeof input[key] !== 'string') {
    fieldErrors[key] = 'Must be text.';
    return undefined;
  }
  const note = normalizeModerationText(input[key]);
  if (note.length > MODERATION_NOTE_MAX_LENGTH) fieldErrors[key] = `Keep it under ${MODERATION_NOTE_MAX_LENGTH} characters.`;
  return note || undefined;
}

function requiredReason(input: Record<string, unknown>, fieldErrors: Record<string, string>): string {
  const reason = normalizeModerationText(input.reason);
  if (!reason) fieldErrors.reason = 'A reason is required.';
  else if (reason.length > MODERATION_NOTE_MAX_LENGTH) fieldErrors.reason = `Keep it under ${MODERATION_NOTE_MAX_LENGTH} characters.`;
  return reason;
}

export function validateCreateReport(input: unknown): ValidationResult<CreateReportRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  if (!isReportTargetType(input.targetType)) fieldErrors.targetType = 'targetType must be DROP or SQUAD.';
  else if (!isValidReportTargetId(input.targetType, input.targetId)) fieldErrors.targetId = 'Unknown report target.';
  if (!isReportReason(input.reason)) fieldErrors.reason = 'Pick a reason.';
  const note = optionalNote(input, 'note', fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  const value: CreateReportRequest = {
    targetType: input.targetType as ReportTargetType,
    targetId: input.targetId as string,
    reason: input.reason as ReportReason,
  };
  if (note) value.note = note;
  return { ok: true, value };
}

export function validateHideDrop(input: unknown): ValidationResult<HideDropRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  const reason = requiredReason(input, fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { reason } };
}

export function validateSuspendUser(input: unknown): ValidationResult<SuspendUserRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  const reason = requiredReason(input, fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: { reason } };
}

export function validateDismissReports(input: unknown): ValidationResult<DismissReportsRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  if (!isReportTargetType(input.targetType)) fieldErrors.targetType = 'targetType must be DROP or SQUAD.';
  else if (!isValidReportTargetId(input.targetType, input.targetId)) fieldErrors.targetId = 'Unknown report target.';
  const note = optionalNote(input, 'note', fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  const value: DismissReportsRequest = { targetType: input.targetType as ReportTargetType, targetId: input.targetId as string };
  if (note) value.note = note;
  return { ok: true, value };
}

export function validateSetRole(input: unknown): ValidationResult<SetRoleRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const role = input.role;
  if (typeof role !== 'string' || !(ADMIN_ROLE_OPTIONS as readonly string[]).includes(role)) {
    return { ok: false, fieldErrors: { role: 'role must be MEMBER, CREATOR or ADMIN.' } };
  }
  return { ok: true, value: { role: role as UserRole } };
}

export function validateCreatorBadge(input: unknown): ValidationResult<SetCreatorBadgeRequest> {
  if (!isObject(input) || !('badge' in input)) return { ok: false, fieldErrors: { badge: 'badge is required (text, or null to reset).' } };
  if (input.badge === null) return { ok: true, value: { badge: null } };
  if (typeof input.badge !== 'string') return { ok: false, fieldErrors: { badge: 'badge must be text or null.' } };
  const badge = normalizeModerationText(input.badge);
  if (!badge) return { ok: true, value: { badge: null } };
  if (badge.length > MODERATION_BADGE_MAX_LENGTH) {
    return { ok: false, fieldErrors: { badge: `Badge must be at most ${MODERATION_BADGE_MAX_LENGTH} characters.` } };
  }
  return { ok: true, value: { badge } };
}

export function validateClearFlag(input: unknown): ValidationResult<ClearFlagRequest> {
  if (input === undefined || input === null) return { ok: true, value: {} };
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  const note = optionalNote(input, 'note', fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, value: note ? { note } : {} };
}

export function validateRevertLog(input: unknown): ValidationResult<RevertLogRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  if (input.kind !== 'QUEST' && input.kind !== 'WORKOUT') fieldErrors.kind = 'kind must be QUEST or WORKOUT.';
  if (!isUuid(input.logId)) fieldErrors.logId = 'logId must be a ledger row id.';
  const note = optionalNote(input, 'note', fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  const value: RevertLogRequest = { kind: input.kind as LedgerKind, logId: input.logId as string };
  if (note) value.note = note;
  return { ok: true, value };
}

/** Admin user search text: trimmed, whitespace collapsed, at most 50 chars ('' = list everyone). */
export function normalizeUserSearch(value: unknown): string {
  return normalizeModerationText(value).slice(0, 50);
}
