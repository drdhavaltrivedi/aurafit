import { AURA_FLAG_DEFAULTS, type FlaggedUsersResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminContext, adminReadLimiter, forbiddenByDb, guarded } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/flags (ADMIN, AUDIT_ANTI_CHEAT) → FlaggedUsersResponse: users whose recent
 * completions look automated or impossible (thresholds: AURA_FLAG_DEFAULTS), with evidence.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminReadLimiter);
  if (ctx instanceof Response) return ctx;
  return guarded('GET /api/v1/admin/flags', async () => {
    const thresholds = { ...AURA_FLAG_DEFAULTS };
    const r = await ctx.repo.flaggedUsers(ctx.user.profile.id, thresholds, new Date());
    if (r.status !== 'ok') return forbiddenByDb();
    const body: FlaggedUsersResponse = { ...r.flags, thresholds };
    return json(body);
  });
}
