import { isUuid, type ResetSquadNameResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/squads/{squadId}/reset-name (ADMIN, no body) → ResetSquadNameResponse
 * Renames the squad to "Squad <TAG>" and regenerates its invite code (old links stop working).
 * Squads are never deleted by moderation. Open reports on it are resolved as ACTIONED. 404.
 */
export async function POST(request: Request, { params }: { params: Promise<{ squadId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { squadId } = await params;
  if (!isUuid(squadId)) return MODERATION_ERRORS.notFound('Squad not found.');
  return guarded('POST /api/v1/admin/squads/:id/reset-name', async () => {
    const r = await ctx.repo.resetSquadName(ctx.user.profile.id, squadId);
    switch (r.status) {
      case 'reset': {
        const body: ResetSquadNameResponse = { name: r.name, previousName: r.previousName };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.notFound('Squad not found.');
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
