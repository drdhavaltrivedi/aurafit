import {
  ADMIN_ROUTES,
  MODERATION_ROUTES,
  type AdminActionResponse,
  type ApiErrorCode,
  type AdminUserSummaryResponse,
  type AdminUsersResponse,
  type AuditLogResponse,
  type CreateReportRequest,
  type CreateReportResponse,
  type DismissReportsResponse,
  type FlaggedUsersResponse,
  type LedgerKind,
  type ModerationErrorCode,
  type ModerationQueueResponse,
  type ReportTargetType,
  type RevertLogResponse,
  type SetRoleResponse,
  type UserRole,
} from '@aurafit/shared';
import { creatorFetch } from '@/lib/creator/client';

export type ModerationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: ModerationErrorCode | ApiErrorCode | 'NETWORK_ERROR'; message: string; fieldErrors?: Record<string, string> };

/** Same-origin JSON fetch for the moderation endpoints (same error shape as the creator client). */
const modFetch = <T,>(url: string, init?: RequestInit) => creatorFetch<T>(url, init) as Promise<ModerationResult<T>>;
const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Browser client for reports + the admin moderation endpoints. */
export const moderationApi = {
  report: (input: CreateReportRequest) => modFetch<CreateReportResponse>(MODERATION_ROUTES.reports, post(input)),

  queue: () => modFetch<ModerationQueueResponse>(ADMIN_ROUTES.reports),
  dismiss: (targetType: ReportTargetType, targetId: string, note?: string) =>
    modFetch<DismissReportsResponse>(ADMIN_ROUTES.dismissReports, post({ targetType, targetId, ...(note ? { note } : {}) })),
  hideDrop: (dropId: string, reason: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.hideDrop(dropId), post({ reason })),
  restoreDrop: (dropId: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.restoreDrop(dropId), post()),
  resetSquadName: (squadId: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.resetSquadName(squadId), post()),

  flags: () => modFetch<FlaggedUsersResponse>(ADMIN_ROUTES.flags),
  users: (q: string, after?: string | null) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (after) params.set('after', after);
    const qs = params.toString();
    return modFetch<AdminUsersResponse>(qs ? `${ADMIN_ROUTES.users}?${qs}` : ADMIN_ROUTES.users);
  },
  user: (id: string) => modFetch<AdminUserSummaryResponse>(ADMIN_ROUTES.user(id)),
  setRole: (id: string, role: UserRole) => modFetch<SetRoleResponse>(ADMIN_ROUTES.userRole(id), { method: 'PUT', body: JSON.stringify({ role }) }),
  suspend: (id: string, reason: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.suspend(id), post({ reason })),
  unsuspend: (id: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.unsuspend(id), post()),
  clearFlag: (id: string, note?: string) => modFetch<AdminActionResponse>(ADMIN_ROUTES.clearFlag(id), post(note ? { note } : undefined)),
  revert: (id: string, kind: LedgerKind, logId: string, note?: string) =>
    modFetch<RevertLogResponse>(ADMIN_ROUTES.revert(id), post({ kind, logId, ...(note ? { note } : {}) })),

  audit: (before?: { createdAt: string; id: string } | null) =>
    modFetch<AuditLogResponse>(
      before ? `${ADMIN_ROUTES.audit}?${new URLSearchParams({ before: before.createdAt, beforeId: before.id })}` : ADMIN_ROUTES.audit,
    ),
};
