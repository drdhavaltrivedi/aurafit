import { makeId, validateDropEditorInput, type CreatorDropResponse, type CreatorDropsResponse } from '@aurafit/shared';
import { forbidUnless, rateLimit } from '@/lib/api/auth';
import { internalError, json } from '@/lib/api/http';
import { creatorContext, readDropBody, validationFailed } from '@/lib/creator/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/creator/drops (PUBLISH_WORKOUT_DROP) → the caller's drops, live and scheduled. */
export async function GET(request: Request): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'PUBLISH_WORKOUT_DROP');
  if (denied) return denied;
  try {
    const body: CreatorDropsResponse = { drops: await ctx.repo.listOwnDrops(ctx.user.profile.id) };
    return json(body);
  } catch (err) {
    console.error('[GET /api/v1/creator/drops]', err);
    return internalError();
  }
}

/** POST /api/v1/creator/drops (PUBLISH_WORKOUT_DROP) DropEditorInput → 201 CreatorDropResponse. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await creatorContext(request);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'PUBLISH_WORKOUT_DROP') ?? rateLimit(ctx.user);
  if (denied) return denied;

  const read = await readDropBody(request);
  if (!read.ok) return read.response;
  const result = validateDropEditorInput(read.body);
  if (!result.ok) return validationFailed(result.fieldErrors);

  try {
    const drop = await ctx.repo.createDrop({ id: makeId('drop'), creatorId: ctx.user.profile.id, input: result.value });
    const body: CreatorDropResponse = { drop };
    return json(body, 201);
  } catch (err) {
    console.error('[POST /api/v1/creator/drops]', err);
    return internalError();
  }
}
