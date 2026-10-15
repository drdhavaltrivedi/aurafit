import { suspensionMessage, type ApiErrorCode, type ModerationApiError, type ModerationErrorCode } from '@aurafit/shared';
import type { AuthedUser } from '@/lib/api/auth';
import { json } from '@/lib/api/http';

/** `{ error, code }` with a moderation-specific code (same shape as every other API error). */
export function moderationError(
  status: number,
  code: ModerationErrorCode | ApiErrorCode,
  error: string,
  extra: Pick<ModerationApiError, 'fieldErrors' | 'details'> = {},
): Response {
  const body: ModerationApiError = { error, code, ...extra };
  return json(body, status);
}

/** True when the profile row (read from the database by requireUser) is suspended. */
export function isSuspended(user: AuthedUser): boolean {
  return !!user.profile.suspended_at;
}

/**
 * 403 SUSPENDED for suspended accounts, else null. Call it in every MUTATING game endpoint
 * (quests, workouts, drops, squads, reports) right after authentication. Enforced at the API
 * level (uniform error for every endpoint, no change to the game SQL functions); the completion
 * ledgers also reject suspended profiles with a trigger as a backstop.
 */
export function denySuspended(user: AuthedUser): Response | null {
  return isSuspended(user) ? moderationError(403, 'SUSPENDED', suspensionMessage(user.profile.suspension_reason)) : null;
}
