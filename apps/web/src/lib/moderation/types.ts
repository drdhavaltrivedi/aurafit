import type {
  AccountModerationResponse,
  AdminUserSummary,
  AdminUsersResponse,
  AuditAction,
  AuditLogResponse,
  AuditTargetType,
  AuraFlagThresholds,
  CreateReportRequest,
  DismissReportsRequest,
  FlaggedUsersResponse,
  ModerationQueueResponse,
  RevertLogRequest,
  UserRole,
} from '@aurafit/shared';

/** Every admin_* SQL function may answer `forbidden` (actor is not an active ADMIN in the database). */
type Forbidden = { status: 'forbidden' };

export type SubmitReportResult =
  | { status: 'created'; reportId: string }
  | { status: 'already_reported' | 'target_not_found' | 'cannot_report_own' | 'profile_not_found' | 'invalid' };
export type QueueResult = { status: 'ok'; queue: ModerationQueueResponse } | Forbidden;
export type HideDropResult = { status: 'hidden'; resolvedReports: number } | { status: 'already_hidden' | 'not_found' | 'invalid' } | Forbidden;
export type RestoreDropResult = { status: 'restored' | 'not_hidden' | 'not_found' } | Forbidden;
export type DismissResult = { status: 'dismissed'; count: number } | { status: 'no_open_reports' | 'invalid' } | Forbidden;
export type ResetSquadResult = { status: 'reset'; name: string; previousName: string; resolvedReports: number } | { status: 'not_found' } | Forbidden;
export type BadgeResult = { status: 'updated'; badge: string } | { status: 'not_found' | 'not_verified_creator' | 'invalid' } | Forbidden;
export type SetRoleResult =
  | { status: 'updated' | 'unchanged'; role: UserRole }
  | { status: 'not_found' | 'cannot_change_self' | 'last_admin' | 'system_profile' }
  | Forbidden;
export type SearchUsersResult = { status: 'ok'; page: AdminUsersResponse } | Forbidden;
export type UserSummaryResult = { status: 'ok'; user: AdminUserSummary } | { status: 'not_found' } | Forbidden;
export type SuspendResult =
  | { status: 'suspended' | 'already_suspended' | 'not_found' | 'cannot_suspend_self' | 'cannot_suspend_admin' | 'system_profile' | 'invalid' }
  | Forbidden;
export type UnsuspendResult = { status: 'unsuspended' | 'not_suspended' | 'not_found' } | Forbidden;
export type FlagsResult = { status: 'ok'; flags: Omit<FlaggedUsersResponse, 'thresholds'> } | Forbidden;
export type ClearFlagResult = { status: 'cleared' | 'not_found' | 'invalid' } | Forbidden;
export type RevertResult = { status: 'reverted'; auraRemoved: number; auraPoints: number } | { status: 'not_found' | 'invalid' } | Forbidden;
export type AuditResult = { status: 'ok'; page: AuditLogResponse } | Forbidden;

export interface AuditFilter {
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  limit: number;
  before?: { createdAt: string; id: string };
}

/**
 * Database access for reports + admin moderation. Every call is one server-only SQL function
 * (service_role; see supabase/migrations/20261014140000_moderation.sql). The admin_* functions
 * re-check the actor's ADMIN role in the database and write the audit row in the same transaction.
 */
export interface ModerationRepository {
  submitReport(reporterId: string, input: CreateReportRequest): Promise<SubmitReportResult>;
  /** null when the profile does not exist. */
  accountModeration(profileId: string): Promise<AccountModerationResponse | null>;
  queue(actorId: string, limit: number): Promise<QueueResult>;
  hideDrop(actorId: string, dropId: string, reason: string): Promise<HideDropResult>;
  restoreDrop(actorId: string, dropId: string): Promise<RestoreDropResult>;
  dismissReports(actorId: string, input: DismissReportsRequest): Promise<DismissResult>;
  resetSquadName(actorId: string, squadId: string): Promise<ResetSquadResult>;
  setCreatorBadge(actorId: string, dropId: string, badge: string | null): Promise<BadgeResult>;
  setRole(actorId: string, targetId: string, role: UserRole): Promise<SetRoleResult>;
  searchUsers(actorId: string, query: string, limit: number, after: string | null): Promise<SearchUsersResult>;
  userSummary(actorId: string, targetId: string): Promise<UserSummaryResult>;
  suspend(actorId: string, targetId: string, reason: string): Promise<SuspendResult>;
  unsuspend(actorId: string, targetId: string): Promise<UnsuspendResult>;
  flaggedUsers(actorId: string, thresholds: AuraFlagThresholds, now: Date): Promise<FlagsResult>;
  clearFlag(actorId: string, targetId: string, note: string | undefined): Promise<ClearFlagResult>;
  revertLog(actorId: string, targetId: string, input: RevertLogRequest): Promise<RevertResult>;
  auditEntries(actorId: string, filter: AuditFilter): Promise<AuditResult>;
}
