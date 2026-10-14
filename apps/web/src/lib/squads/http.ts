import { buildMySquad, type MySquadResponse, type SquadApiError, type SquadErrorCode, type ApiErrorCode } from '@aurafit/shared';
import { requireUser, rateLimit, type AuthedUser } from '@/lib/api/auth';
import { apiError, BodyError, json, notConfigured, readJson } from '@/lib/api/http';
import { createRateLimiter } from '@/lib/api/rate-limit';
import { getSquadRepository } from '@/lib/squads';
import type { SquadRepository } from './types';

/**
 * Create / join / regenerate invite code: burst of 6, then 1 request / 30 s per user. Together with
 * the 1.1e12 code space this makes guessing invite codes impractical. (Per instance; see rate-limit.ts.)
 */
export const squadActionLimiter = createRateLimiter({ capacity: 6, refillPerSecond: 1 / 30 });

export const MAX_SQUAD_BODY_BYTES = 1024;

/** `{ error, code }` with a squad-specific code (same shape as every other API error). */
export function squadError(
  status: number,
  code: SquadErrorCode | ApiErrorCode,
  error: string,
  extra: Pick<SquadApiError, 'fieldErrors'> = {},
): Response {
  const body: SquadApiError = { error, code, ...extra };
  return json(body, status);
}

export const SQUAD_ERRORS = {
  alreadyInSquad: () => squadError(409, 'ALREADY_IN_SQUAD', "You're already in a squad. Leave it before joining or creating another."),
  notInSquad: () => squadError(404, 'NOT_IN_SQUAD', "You're not in a squad."),
  notLeader: () => squadError(403, 'NOT_SQUAD_LEADER', 'Only the squad leader can do that.'),
  invalidCode: () =>
    squadError(404, 'INVALID_INVITE_CODE', "That invite code doesn't match any squad. Check it, or ask the leader for a new one."),
  full: () => squadError(409, 'SQUAD_FULL', 'This squad is full.'),
  nameTaken: () => squadError(409, 'SQUAD_NAME_TAKEN', 'That squad name is taken.', { fieldErrors: { name: 'That squad name is taken.' } }),
  tagTaken: () => squadError(409, 'SQUAD_TAG_TAKEN', 'That tag is taken.', { fieldErrors: { tag: 'That tag is taken.' } }),
  memberNotFound: () => squadError(404, 'MEMBER_NOT_FOUND', "That hunter isn't in your squad."),
  cannotRemoveSelf: () => squadError(400, 'CANNOT_REMOVE_SELF', "Leaders can't remove themselves. Leave the squad instead."),
  profileNotFound: () => apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.'),
};

export type SquadContext = { user: AuthedUser; repo: SquadRepository };

/**
 * Auth (+ optional rate limit) + squad repository. Returns a Response to send as-is on failure.
 * `limiter: false` skips rate limiting (reads).
 */
export async function squadContext(
  request: Request,
  limiter: Parameters<typeof rateLimit>[1] | false = undefined,
): Promise<SquadContext | Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  if (limiter !== false) {
    const limited = rateLimit(auth.user, limiter);
    if (limited) return limited;
  }
  const repo = getSquadRepository();
  if (!repo) return notConfigured();
  return { user: auth.user, repo };
}

/** Parses a small JSON body; returns the value or an error Response. */
export async function readSquadBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await readJson(request, MAX_SQUAD_BODY_BYTES) };
  } catch (err) {
    if (err instanceof BodyError) return { ok: false, response: err.response };
    return { ok: false, response: apiError(400, 'BAD_REQUEST', 'Unable to read request body') };
  }
}

export function validationFailed(fieldErrors: Record<string, string>, message = 'Invalid squad request.'): Response {
  return apiError(400, 'VALIDATION_FAILED', message, { details: Object.values(fieldErrors), fieldErrors });
}

/** The caller's squad as the API returns it (status 200 unless given). */
export async function mySquadResponse(ctx: SquadContext, status = 200, now = new Date()): Promise<Response> {
  const snapshot = await ctx.repo.getMemberSquad(ctx.user.profile.id, now);
  const body: MySquadResponse = { squad: snapshot ? buildMySquad(snapshot, ctx.user.profile.id, now) : null };
  return json(body, status);
}
