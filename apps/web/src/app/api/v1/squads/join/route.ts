import { validateJoinSquad } from '@aurafit/shared';
import { forbidUnless } from '@/lib/api/auth';
import { internalError } from '@/lib/api/http';
import { mySquadResponse, readSquadBody, SQUAD_ERRORS, squadActionLimiter, squadContext, validationFailed } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/squads/join { code } → MySquadResponse
 * 400 VALIDATION_FAILED | 404 INVALID_INVITE_CODE | 409 ALREADY_IN_SQUAD / SQUAD_FULL | 429
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await squadContext(request, squadActionLimiter);
  if (ctx instanceof Response) return ctx;
  const denied = forbidUnless(ctx.user, 'JOIN_SQUAD');
  if (denied) return denied;

  const read = await readSquadBody(request);
  if (!read.ok) return read.response;
  const v = validateJoinSquad(read.body);
  if (!v.ok) return validationFailed(v.fieldErrors, 'Invalid invite code.');

  try {
    const r = await ctx.repo.joinSquad(ctx.user.profile.id, v.value.code);
    switch (r.status) {
      case 'joined':
        return await mySquadResponse(ctx);
      case 'invalid_code':
        return SQUAD_ERRORS.invalidCode();
      case 'already_in_squad':
        return SQUAD_ERRORS.alreadyInSquad();
      case 'full':
        return SQUAD_ERRORS.full();
      case 'profile_not_found':
        return SQUAD_ERRORS.profileNotFound();
    }
  } catch (err) {
    console.error('[POST /api/v1/squads/join]', err);
    return internalError();
  }
}
