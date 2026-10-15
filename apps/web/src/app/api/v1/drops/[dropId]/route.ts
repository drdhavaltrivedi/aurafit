import { isSystemDropId, validateDropEditorInput, type CreatorDropResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit } from '@/lib/api/auth';
import { internalError, isValidId, json } from '@/lib/api/http';
import { CREATOR_ERRORS, creatorContext, readDropBody, validationFailed } from '@/lib/creator/http';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ dropId: string }> };

/**
 * PATCH /api/v1/drops/{dropId} (PUBLISH_WORKOUT_DROP, owner) DropEditorInput → CreatorDropResponse.
 * Replaces the drop's content (counters kept). publishAt omitted = unchanged; null = live now;
 * a future time reschedules a SCHEDULED drop (409 ALREADY_LIVE for a live one).
 * 400 | 401 | 403 FORBIDDEN / NOT_DROP_OWNER | 404 | 409 | 429
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'PUBLISH_WORKOUT_DROP') ?? rateLimit(ctx.user);
  if (denied) return denied;

  const { dropId } = await params;
  if (!isValidId(dropId)) return CREATOR_ERRORS.dropNotFound();
  if (isSystemDropId(dropId)) return CREATOR_ERRORS.notOwner();

  const read = await readDropBody(request);
  if (!read.ok) return read.response;
  const result = validateDropEditorInput(read.body, { patch: true });
  if (!result.ok) return validationFailed(result.fieldErrors);

  try {
    const existing = await ctx.repo.getDropForEdit(dropId);
    if (!existing) return CREATOR_ERRORS.dropNotFound();
    if (existing.creatorId !== ctx.user.profile.id) return CREATOR_ERRORS.notOwner();
    if (existing.status === 'LIVE' && typeof result.value.publishAt === 'string') return CREATOR_ERRORS.alreadyLive();

    const drop = await ctx.repo.updateDrop(dropId, ctx.user.profile.id, result.value);
    if (!drop) return CREATOR_ERRORS.dropNotFound();
    const body: CreatorDropResponse = { drop };
    return json(body);
  } catch (err) {
    console.error('[PATCH /api/v1/drops/:id]', err);
    return internalError();
  }
}

/**
 * DELETE /api/v1/drops/{dropId} (owner; any role, so a demoted creator can still remove their drops) → 204.
 * Athletes keep their completion history and aura (ledger rows lose the drop reference).
 * 401 | 403 NOT_DROP_OWNER | 404 | 429
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const limited = rateLimit(ctx.user);
  if (limited) return limited;

  const { dropId } = await params;
  if (!isValidId(dropId)) return CREATOR_ERRORS.dropNotFound();
  if (isSystemDropId(dropId)) return CREATOR_ERRORS.notOwner();

  try {
    const existing = await ctx.repo.getDropForEdit(dropId);
    if (!existing) return CREATOR_ERRORS.dropNotFound();
    if (existing.creatorId !== ctx.user.profile.id) return CREATOR_ERRORS.notOwner();
    if (!(await ctx.repo.deleteDrop(dropId, ctx.user.profile.id))) return CREATOR_ERRORS.dropNotFound();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[DELETE /api/v1/drops/:id]', err);
    return internalError();
  }
}
