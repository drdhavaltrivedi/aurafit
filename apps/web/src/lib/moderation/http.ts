import { hasPermission, type UserPermission } from '@aurafit/shared';
import { rateLimit, requireUser, type AuthedUser } from '@/lib/api/auth';
import { apiError, BodyError, internalError, notConfigured, readJson } from '@/lib/api/http';
import { createRateLimiter, type RateLimiter } from '@/lib/api/rate-limit';
import { getModerationRepository } from '@/lib/moderation';
import { moderationError } from './guard';
import type { ModerationRepository } from './types';

/** Reports: burst of 5, then 1 per minute per user. (Per instance; see rate-limit.ts.) */
export const reportLimiter = createRateLimiter({ capacity: 5, refillPerSecond: 1 / 60 });
/** Admin actions (writes): burst of 20, then 1 per second per admin. */
export const adminActionLimiter = createRateLimiter({ capacity: 20, refillPerSecond: 1 });
/** Admin reads (queue / search / audit): burst of 60, then 2 per second per admin. */
export const adminReadLimiter = createRateLimiter({ capacity: 60, refillPerSecond: 2 });

export const MAX_MODERATION_BODY_BYTES = 2048;

export type AdminContext = { user: AuthedUser; repo: ModerationRepository };

/**
 * Auth + ADMIN role + permission + rate limit + repository. The role is the one requireUser read
 * from public.profiles with the secret key (never a JWT claim or user_metadata); the SQL function
 * re-checks it. Returns a Response to send as-is on failure.
 */
export async function adminContext(request: Request, permission: UserPermission, limiter: RateLimiter): Promise<AdminContext | Response> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;
  if (user.profile.role !== 'ADMIN' || !hasPermission(user.profile.role, permission) || user.profile.suspended_at) {
    return apiError(403, 'FORBIDDEN', 'Admin access required.');
  }
  const limited = rateLimit(user, limiter);
  if (limited) return limited;
  const repo = getModerationRepository();
  if (!repo) return notConfigured();
  return { user, repo };
}

/** Parses a small JSON body; returns the value or an error Response. */
export async function readModerationBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await readJson(request, MAX_MODERATION_BODY_BYTES) };
  } catch (err) {
    if (err instanceof BodyError) return { ok: false, response: err.response };
    return { ok: false, response: apiError(400, 'BAD_REQUEST', 'Unable to read request body') };
  }
}

/** Like readModerationBody, but an empty body (no Content-Type, no bytes) is `undefined`. */
export async function readOptionalBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const length = request.headers.get('content-length');
  if (!request.headers.get('content-type') && (!request.body || length === '0')) return { ok: true, body: undefined };
  return readModerationBody(request);
}

export function validationFailed(fieldErrors: Record<string, string>, message = 'Invalid request.'): Response {
  return apiError(400, 'VALIDATION_FAILED', message, { details: Object.values(fieldErrors), fieldErrors });
}

/** The SQL function said the actor is not an admin (role changed since requireUser): 403. */
export const forbiddenByDb = () => apiError(403, 'FORBIDDEN', 'Admin access required.');

/** Wraps a handler: unexpected errors become 500 INTERNAL_ERROR (logged with `label`). */
export async function guarded(label: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${label}]`, err);
    return internalError();
  }
}

export const MODERATION_ERRORS = {
  notFound: (what = 'Not found.') => apiError(404, 'NOT_FOUND', what),
  alreadyReported: () => moderationError(409, 'ALREADY_REPORTED', "You've already reported this. A moderator will review it."),
  cannotReportOwn: () => moderationError(400, 'CANNOT_REPORT_OWN', "You can't report your own drop or squad."),
  alreadyHidden: () => moderationError(409, 'ALREADY_HIDDEN', 'This drop is already hidden.'),
  notHidden: () => moderationError(409, 'NOT_HIDDEN', 'This drop is not hidden.'),
  noOpenReports: () => moderationError(404, 'NO_OPEN_REPORTS', 'There are no open reports for this item.'),
  notVerifiedCreator: () => moderationError(409, 'NOT_VERIFIED_CREATOR', 'Badges are only for drops by verified creators (role CREATOR or ADMIN).'),
  cannotChangeOwnRole: () => moderationError(400, 'CANNOT_CHANGE_OWN_ROLE', "You can't change your own role. Ask another admin."),
  lastAdmin: () => moderationError(409, 'LAST_ADMIN', 'At least one admin must remain. Promote someone else first.'),
  systemProfile: () => moderationError(409, 'SYSTEM_PROFILE', 'System profiles (like @aurafit) cannot be changed.'),
  alreadySuspended: () => moderationError(409, 'ALREADY_SUSPENDED', 'This account is already suspended.'),
  notSuspended: () => moderationError(409, 'NOT_SUSPENDED', 'This account is not suspended.'),
  cannotSuspendSelf: () => moderationError(400, 'CANNOT_SUSPEND_SELF', "You can't suspend yourself."),
  cannotSuspendAdmin: () => moderationError(409, 'CANNOT_SUSPEND_ADMIN', 'Admins cannot be suspended. Change their role first.'),
  logNotFound: () => moderationError(404, 'LOG_NOT_FOUND', "That completion doesn't exist for this user (it may already be reverted)."),
};
