import type { InviteCodeResponse } from '@aurafit/shared';
import { internalError, json } from '@/lib/api/http';
import { SQUAD_ERRORS, squadActionLimiter, squadContext } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/squads/me/invite-code (leader) → InviteCodeResponse. The old code stops working.
 * 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD | 429
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await squadContext(request, squadActionLimiter);
  if (ctx instanceof Response) return ctx;
  try {
    const r = await ctx.repo.regenerateInviteCode(ctx.user.profile.id);
    switch (r.status) {
      case 'regenerated': {
        const body: InviteCodeResponse = { inviteCode: r.inviteCode };
        return json(body);
      }
      case 'not_in_squad':
        return SQUAD_ERRORS.notInSquad();
      case 'not_leader':
        return SQUAD_ERRORS.notLeader();
    }
  } catch (err) {
    console.error('[POST /api/v1/squads/me/invite-code]', err);
    return internalError();
  }
}
