import { ADMIN_QUEUE_LIMIT } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminContext, adminReadLimiter, forbiddenByDb, guarded } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/reports?limit=1..100 (ADMIN, AUDIT_ANTI_CHEAT) → ModerationQueueResponse:
 * open reports grouped by target, most-reported first, with reason counts, the latest reasons /
 * notes and a target preview. Never includes reporter identities.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminReadLimiter);
  if (ctx instanceof Response) return ctx;
  const raw = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isInteger(raw) && raw >= 1 && raw <= 100 ? raw : ADMIN_QUEUE_LIMIT;
  return guarded('GET /api/v1/admin/reports', async () => {
    const r = await ctx.repo.queue(ctx.user.profile.id, limit);
    return r.status === 'ok' ? json(r.queue) : forbiddenByDb();
  });
}
