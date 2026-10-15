import { ADMIN_AUDIT_PAGE_SIZE, isAuditAction, isAuditTargetType, isUuid } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminContext, adminReadLimiter, forbiddenByDb, guarded, validationFailed } from '@/lib/moderation/http';
import type { AuditFilter } from '@/lib/moderation/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/audit?action=&targetType=&targetId=&limit=&before=<ISO>&beforeId=<uuid>
 * (ADMIN, AUDIT_ANTI_CHEAT) → AuditLogResponse, newest first (keyset pagination via nextBefore).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminReadLimiter);
  if (ctx instanceof Response) return ctx;
  const q = new URL(request.url).searchParams;
  const fieldErrors: Record<string, string> = {};
  const filter: AuditFilter = { limit: ADMIN_AUDIT_PAGE_SIZE };
  const action = q.get('action');
  if (action) {
    if (isAuditAction(action)) filter.action = action;
    else fieldErrors.action = 'Unknown action.';
  }
  const targetType = q.get('targetType');
  if (targetType) {
    if (isAuditTargetType(targetType)) filter.targetType = targetType;
    else fieldErrors.targetType = 'Unknown target type.';
  }
  const targetId = q.get('targetId');
  if (targetId) {
    if (/^[A-Za-z0-9_-]{1,100}$/.test(targetId)) filter.targetId = targetId;
    else fieldErrors.targetId = 'Invalid target id.';
  }
  const limit = Number(q.get('limit'));
  if (q.get('limit')) {
    if (Number.isInteger(limit) && limit >= 1 && limit <= 100) filter.limit = limit;
    else fieldErrors.limit = 'limit must be 1-100.';
  }
  const before = q.get('before');
  const beforeId = q.get('beforeId');
  if (before || beforeId) {
    if (before && !Number.isNaN(Date.parse(before)) && isUuid(beforeId)) filter.before = { createdAt: before, id: beforeId }; // keep microseconds (keyset)
    else fieldErrors.before = 'before must be an ISO timestamp with a beforeId.';
  }
  if (Object.keys(fieldErrors).length) return validationFailed(fieldErrors);
  return guarded('GET /api/v1/admin/audit', async () => {
    const r = await ctx.repo.auditEntries(ctx.user.profile.id, filter);
    return r.status === 'ok' ? json(r.page) : forbiddenByDb();
  });
}
