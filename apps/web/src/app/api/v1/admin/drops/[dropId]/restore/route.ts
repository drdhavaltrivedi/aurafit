import type { AdminActionResponse } from '@aurafit/shared';
import { isValidId, json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/** POST /api/v1/admin/drops/{dropId}/restore (ADMIN, no body) → AdminActionResponse | 404 | 409 NOT_HIDDEN */
export async function POST(request: Request, { params }: { params: Promise<{ dropId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { dropId } = await params;
  if (!isValidId(dropId)) return MODERATION_ERRORS.notFound('Workout drop not found.');
  return guarded('POST /api/v1/admin/drops/:id/restore', async () => {
    const r = await ctx.repo.restoreDrop(ctx.user.profile.id, dropId);
    switch (r.status) {
      case 'restored': {
        const body: AdminActionResponse = { ok: true };
        return json(body);
      }
      case 'not_hidden':
        return MODERATION_ERRORS.notHidden();
      case 'not_found':
        return MODERATION_ERRORS.notFound('Workout drop not found.');
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
