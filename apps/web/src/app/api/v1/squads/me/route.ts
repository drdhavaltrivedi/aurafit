import { validateUpdateSquad } from '@aurafit/shared';
import { denySuspended } from '@/lib/moderation/guard';
import { internalError } from '@/lib/api/http';
import { mySquadResponse, readSquadBody, SQUAD_ERRORS, squadContext, validationFailed } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/** GET /api/v1/squads/me → MySquadResponse (`squad: null` when not in a squad). */
export async function GET(request: Request): Promise<Response> {
  const ctx = await squadContext(request, false);
  if (ctx instanceof Response) return ctx;
  try {
    return await mySquadResponse(ctx);
  } catch (err) {
    console.error('[GET /api/v1/squads/me]', err);
    return internalError();
  }
}

/**
 * PATCH /api/v1/squads/me { weeklyGoal?, name?, icon? } (leader) → MySquadResponse
 * 400 VALIDATION_FAILED | 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD | 409 SQUAD_NAME_TAKEN | 429
 */
export async function PATCH(request: Request): Promise<Response> {
  const ctx = await squadContext(request);
  if (ctx instanceof Response) return ctx;
  const suspended = denySuspended(ctx.user);
  if (suspended) return suspended;
  const read = await readSquadBody(request);
  if (!read.ok) return read.response;
  const v = validateUpdateSquad(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);

  try {
    const r = await ctx.repo.updateSquad(ctx.user.profile.id, v.value);
    switch (r.status) {
      case 'updated':
        return await mySquadResponse(ctx);
      case 'not_in_squad':
        return SQUAD_ERRORS.notInSquad();
      case 'not_leader':
        return SQUAD_ERRORS.notLeader();
      case 'name_taken':
        return SQUAD_ERRORS.nameTaken();
    }
  } catch (err) {
    console.error('[PATCH /api/v1/squads/me]', err);
    return internalError();
  }
}
