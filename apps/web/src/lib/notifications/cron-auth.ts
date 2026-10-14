import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Minimum CRON_SECRET length accepted as configured (generate with `openssl rand -hex 32`). */
export const MIN_CRON_SECRET_LENGTH = 32;

/** CRON_SECRET from the environment, or null when unset / too short to be safe. */
export function getCronSecret(): string | null {
  const s = (process.env.CRON_SECRET ?? '').trim();
  return s.length >= MIN_CRON_SECRET_LENGTH ? s : null;
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/**
 * Constant-time check of `Authorization: Bearer <secret>`. Both sides are hashed first so
 * timingSafeEqual always compares equal-length buffers and the length of the secret leaks nothing.
 */
export function isAuthorizedCronRequest(authorization: string | null, secret: string): boolean {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  const provided = m?.[1] ?? '';
  const ok = timingSafeEqual(digest(provided), digest(secret));
  return ok && provided.length > 0;
}
