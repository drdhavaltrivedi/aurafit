import { validateHideDrop, type AdminActionResponse } from '@aurafit/shared';
import { isValidId, json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readModerationBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/drops/{dropId}/hide { reason } (ADMIN) → AdminActionResponse
 * Hides the drop from every public listing; its creator sees "Hidden by moderator: <reason>".
 * Open reports on it are resolved as ACTIONED. 404 | 409 ALREADY_HIDDEN.
 */
export async function POST(request: Request, { params }: { params: Promise<{ dropId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { dropId } = await params;
  if (!isValidId(dropId)) return MODERATION_ERRORS.notFound('Workout drop not found.');
  const read = await readModerationBody(request);
  if (!read.ok) return read.response;
  const v = validateHideDrop(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('POST /api/v1/admin/drops/:id/hide', async () => {
    const r = await ctx.repo.hideDrop(ctx.user.profile.id, dropId, v.value.reason);
    switch (r.status) {
      case 'hidden': {
        const body: AdminActionResponse = { ok: true, resolvedReports: r.resolvedReports };
        return json(body);
      }
      case 'already_hidden':
        return MODERATION_ERRORS.alreadyHidden();
      case 'not_found':
        return MODERATION_ERRORS.notFound('Workout drop not found.');
      case 'invalid':
        return validationFailed({ reason: 'A reason is required.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
