import { validateCreateSquad } from '@aurafit/shared';
import { forbidUnless } from '@/lib/api/auth';
import { internalError } from '@/lib/api/http';
import { mySquadResponse, readSquadBody, SQUAD_ERRORS, squadActionLimiter, squadContext, validationFailed } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/squads { name, tag, icon } → 201 MySquadResponse (caller leads the new squad)
 * 400 VALIDATION_FAILED | 401 | 403 | 409 ALREADY_IN_SQUAD / SQUAD_NAME_TAKEN / SQUAD_TAG_TAKEN | 429
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await squadContext(request, squadActionLimiter);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'JOIN_SQUAD');
  if (denied) return denied;

  const read = await readSquadBody(request);
  if (!read.ok) return read.response;
  const v = validateCreateSquad(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors);

  try {
    const r = await ctx.repo.createSquad(ctx.user.profile.id, v.value);
    switch (r.status) {
      case 'created':
        return await mySquadResponse(ctx, 201);
      case 'already_in_squad':
        return SQUAD_ERRORS.alreadyInSquad();
      case 'name_taken':
        return SQUAD_ERRORS.nameTaken();
      case 'tag_taken':
        return SQUAD_ERRORS.tagTaken();
      case 'profile_not_found':
        return SQUAD_ERRORS.profileNotFound();
    }
  } catch (err) {
    console.error('[POST /api/v1/squads]', err);
    return internalError();
  }
}
