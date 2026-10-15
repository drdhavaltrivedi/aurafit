import type { ApiErrorCode, CreatorApiError, CreatorErrorCode, CreatorSummary } from '@aurafit/shared';
import { normalizeShareHandle } from '@aurafit/shared';
import { requireUser, type AuthedUser } from '@/lib/api/auth';
import { apiError, BodyError, json, notConfigured, readJson } from '@/lib/api/http';
import { createRateLimiter } from '@/lib/api/rate-limit';
import { getCreatorRepository } from '@/lib/creator';
import type { CreatorRecord, CreatorRepository } from './types';

/** 30 exercises x ~450 bytes + the rest of the drop, with headroom. */
export const MAX_DROP_BODY_BYTES = 24 * 1024;

/** Analytics aggregate the ledgers: burst of 20, then 1 request / 3 s per user. (Per instance.) */
export const analyticsLimiter = createRateLimiter({ capacity: 20, refillPerSecond: 1 / 3 });

/** Follow / unfollow: burst of 20, then 1 request / 2 s per user. (Per instance.) */
export const followLimiter = createRateLimiter({ capacity: 20, refillPerSecond: 0.5 });

export function creatorError(
  status: number,
  code: CreatorErrorCode | ApiErrorCode,
  error: string,
  extra: Pick<CreatorApiError, 'fieldErrors' | 'details'> = {},
): Response {
  const body: CreatorApiError = { error, code, ...extra };
  return json(body, status);
}

export const CREATOR_ERRORS = {
  notOwner: () => creatorError(403, 'NOT_DROP_OWNER', 'You can only edit or delete your own drops.'),
  dropNotFound: () => apiError(404, 'NOT_FOUND', 'Workout drop not found.'),
  alreadyLive: () =>
    creatorError(409, 'ALREADY_LIVE', 'This drop is already live, so it cannot be scheduled again.', {
      fieldErrors: { publishAt: 'This drop is already live.' },
    }),
  creatorNotFound: () => creatorError(404, 'CREATOR_NOT_FOUND', 'No creator with that handle.'),
  cannotFollowSelf: () => creatorError(400, 'CANNOT_FOLLOW_SELF', "You can't follow yourself."),
};

export function validationFailed(fieldErrors: Record<string, string>, message = 'Invalid workout drop.'): Response {
  return apiError(400, 'VALIDATION_FAILED', message, { details: Object.values(fieldErrors), fieldErrors });
}

/** Auth + creator repository; a Response to send as-is on failure. */
export async function creatorContext(request: Request): Promise<{ user: AuthedUser; repo: CreatorRepository } | Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const repo = getCreatorRepository();
  if (!repo) return notConfigured();
  return { user: auth.user, repo };
}

export async function readDropBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await readJson(request, MAX_DROP_BODY_BYTES) };
  } catch (err) {
    if (err instanceof BodyError) return { ok: false, response: err.response };
    return { ok: false, response: apiError(400, 'BAD_REQUEST', 'Unable to read request body') };
  }
}

/** Route param ("aurafit", "@aurafit", URL-encoded) → stored handle ("@aurafit"), or null. */
export function handleFromParam(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return normalizeShareHandle(decoded);
}

export function toSummary(c: CreatorRecord): CreatorSummary {
  const { bio: _bio, ...summary } = c;
  return summary;
}
