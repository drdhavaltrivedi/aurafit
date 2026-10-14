import { internalError } from '@/lib/api/http';
import { mySquadResponse, SQUAD_ERRORS, squadContext } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/v1/squads/me/members/{profileId} (leader) → MySquadResponse
 * 400 CANNOT_REMOVE_SELF | 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD / MEMBER_NOT_FOUND | 429
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }): Promise<Response> {
  const ctx = await squadContext(request);
  if (ctx instanceof Response) return ctx;
  const { profileId } = await params;
  if (!UUID.test(profileId)) return SQUAD_ERRORS.memberNotFound();

  try {
    const r = await ctx.repo.removeMember(ctx.user.profile.id, profileId.toLowerCase());
    switch (r.status) {
      case 'removed':
        return await mySquadResponse(ctx);
      case 'not_in_squad':
        return SQUAD_ERRORS.notInSquad();
      case 'not_leader':
        return SQUAD_ERRORS.notLeader();
      case 'member_not_found':
        return SQUAD_ERRORS.memberNotFound();
      case 'cannot_remove_self':
        return SQUAD_ERRORS.cannotRemoveSelf();
    }
  } catch (err) {
    console.error('[DELETE /api/v1/squads/me/members/:id]', err);
    return internalError();
  }
}
