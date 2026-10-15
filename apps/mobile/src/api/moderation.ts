/**
 * Moderation endpoints of the AuraFit API: reports, own moderation state and the admin console
 * (`/api/v1/reports`, `/api/v1/me/moderation`, `/api/v1/admin/**`). See packages/shared/src/moderation.ts.
 *
 * Pure TypeScript (no React Native imports) so request shapes are unit-tested in Node; the app binds
 * it to the signed-in client in src/hooks/useModeration.ts.
 */
import {
  ADMIN_ROUTES,
  MODERATION_ROUTES,
  type AccountModerationResponse,
  type AdminActionResponse,
  type AdminUserSummaryResponse,
  type AdminUsersResponse,
  type AuditLogResponse,
  type CreateReportRequest,
  type CreateReportResponse,
  type DismissReportsRequest,
  type DismissReportsResponse,
  type FlaggedUsersResponse,
  type LedgerKind,
  type ModerationQueueResponse,
  type ReportTargetType,
  type ResetSquadNameResponse,
  type RevertLogRequest,
  type RevertLogResponse,
  type SetRoleRequest,
  type SetRoleResponse,
  type UserRole,
} from '@aurafit/shared';
import type { ApiClient } from './client';

type Requester = Pick<ApiClient, 'request'>;

/** `?a=1&b=2` from the defined, non-empty params ('' when none). */
export function queryString(params: Record<string, string | null | undefined>): string {
  const parts = Object.entries(params)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const optionalNote = (note?: string) => {
  const n = note?.trim();
  return n ? { note: n } : {};
};

export function createModerationApi(c: Requester) {
  return {
    // ---- Any signed-in user ----
    report: (input: CreateReportRequest) =>
      c.request<CreateReportResponse>(MODERATION_ROUTES.reports, {
        method: 'POST',
        body: { targetType: input.targetType, targetId: input.targetId, reason: input.reason, ...optionalNote(input.note) },
      }),
    me: (signal?: AbortSignal) => c.request<AccountModerationResponse>(MODERATION_ROUTES.me, { signal }),

    // ---- Admin: report queue ----
    queue: (signal?: AbortSignal) => c.request<ModerationQueueResponse>(ADMIN_ROUTES.reports, { signal }),
    dismiss: (targetType: ReportTargetType, targetId: string, note?: string) =>
      c.request<DismissReportsResponse>(ADMIN_ROUTES.dismissReports, {
        method: 'POST',
        body: { targetType, targetId, ...optionalNote(note) } satisfies DismissReportsRequest,
      }),
    hideDrop: (dropId: string, reason: string) =>
      c.request<AdminActionResponse>(ADMIN_ROUTES.hideDrop(dropId), { method: 'POST', body: { reason: reason.trim() } }),
    restoreDrop: (dropId: string) => c.request<AdminActionResponse>(ADMIN_ROUTES.restoreDrop(dropId), { method: 'POST' }),
    resetSquadName: (squadId: string) =>
      c.request<ResetSquadNameResponse>(ADMIN_ROUTES.resetSquadName(squadId), { method: 'POST' }),

    // ---- Admin: aura flags ----
    flags: (signal?: AbortSignal) => c.request<FlaggedUsersResponse>(ADMIN_ROUTES.flags, { signal }),
    clearFlag: (profileId: string, note?: string) =>
      c.request<AdminActionResponse>(ADMIN_ROUTES.clearFlag(profileId), { method: 'POST', body: optionalNote(note) }),
    revert: (profileId: string, kind: LedgerKind, logId: string, note?: string) =>
      c.request<RevertLogResponse>(ADMIN_ROUTES.revert(profileId), {
        method: 'POST',
        body: { kind, logId, ...optionalNote(note) } satisfies RevertLogRequest,
      }),

    // ---- Admin: users ----
    users: (q: string, after?: string | null, signal?: AbortSignal) =>
      c.request<AdminUsersResponse>(`${ADMIN_ROUTES.users}${queryString({ q: q.trim(), after })}`, { signal }),
    user: (profileId: string, signal?: AbortSignal) => c.request<AdminUserSummaryResponse>(ADMIN_ROUTES.user(profileId), { signal }),
    setRole: (profileId: string, role: UserRole) =>
      c.request<SetRoleResponse>(ADMIN_ROUTES.userRole(profileId), { method: 'PUT', body: { role } satisfies SetRoleRequest }),
    suspend: (profileId: string, reason: string) =>
      c.request<AdminActionResponse>(ADMIN_ROUTES.suspend(profileId), { method: 'POST', body: { reason: reason.trim() } }),
    unsuspend: (profileId: string) => c.request<AdminActionResponse>(ADMIN_ROUTES.unsuspend(profileId), { method: 'POST' }),

    // ---- Admin: audit log ----
    audit: (before?: { createdAt: string; id: string } | null, signal?: AbortSignal) =>
      c.request<AuditLogResponse>(
        `${ADMIN_ROUTES.audit}${before ? queryString({ before: before.createdAt, beforeId: before.id }) : ''}`,
        { signal }
      ),
  };
}

export type ModerationApi = ReturnType<typeof createModerationApi>;
