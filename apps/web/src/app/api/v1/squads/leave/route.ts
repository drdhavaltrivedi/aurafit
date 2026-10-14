import type { LeaveSquadResponse } from '@aurafit/shared';
import { internalError, json } from '@/lib/api/http';
import { SQUAD_ERRORS, squadContext } from '@/lib/squads/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/squads/leave → LeaveSquadResponse. A leaving leader hands over to the
 * longest-standing member; the last member leaving deletes the squad. 404 NOT_IN_SQUAD | 429.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await squadContext(request);
  if (ctx instanceof Response) return ctx;
  try {
    const r = await ctx.repo.leaveSquad(ctx.user.profile.id);
    switch (r.status) {
      case 'left': {
        const body: LeaveSquadResponse = { squad: null, squadDeleted: r.squadDeleted };
        return json(body);
      }
      case 'not_in_squad':
        return SQUAD_ERRORS.notInSquad();
      case 'profile_not_found':
        return SQUAD_ERRORS.profileNotFound();
    }
  } catch (err) {
    console.error('[POST /api/v1/squads/leave]', err);
    return internalError();
  }
}
