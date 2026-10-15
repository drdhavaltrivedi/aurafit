import { isUuid, validateClearFlag, type AdminActionResponse } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminActionLimiter, adminContext, forbiddenByDb, guarded, MODERATION_ERRORS, readOptionalBody, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/users/{profileId}/clear-flag { note? } (ADMIN) → AdminActionResponse | 404
 * Marks the user's current aura flags as reviewed: only completions after now can flag them again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminActionLimiter);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!isUuid(profileId)) return MODERATION_ERRORS.notFound('User not found.');
  const read = await readOptionalBody(request);
  if (!read.ok) return read.response;
  const v = validateClearFlag(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);
  return guarded('POST /api/v1/admin/users/:id/clear-flag', async () => {
    const r = await ctx.repo.clearFlag(ctx.user.profile.id, profileId, v.value.note);
    switch (r.status) {
      case 'cleared': {
        const body: AdminActionResponse = { ok: true };
        return json(body);
      }
      case 'not_found':
        return MODERATION_ERRORS.notFound('User not found.');
      case 'invalid':
        return validationFailed({ note: 'Invalid note.' });
      case 'forbidden':
        return forbiddenByDb();
    }
  });
}
