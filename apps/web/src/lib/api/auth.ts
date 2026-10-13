import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission, type UserPermission } from '@aurafit/shared';
import { getRepository, type GameRepository, type ProfileRow } from '@/lib/data';
import { createTokenVerifier } from '@/lib/supabase/admin';
import { isAuthConfigured } from '@/lib/supabase/env';
import { createClient as createCookieClient } from '@/lib/supabase/server';
import { apiError, internalError, notConfigured } from './http';
import { mutationLimiter, type RateLimiter } from './rate-limit';

export interface AuthedUser {
  /** auth.users.id (JWT `sub`). */
  authId: string;
  email?: string;
  /** public.profiles row; `profile.id` is the game user id. */
  profile: ProfileRow;
  repo: GameRepository;
  via: 'bearer' | 'cookie';
}

export type RequireUserResult = { ok: true; user: AuthedUser } | { ok: false; response: Response };

const BEARER = /^Bearer\s+([A-Za-z0-9\-_.]+)$/i;

async function verifiedClaims(client: SupabaseClient, token?: string): Promise<{ sub: string; email?: string; anonymous: boolean } | null> {
  try {
    // getClaims verifies the JWT signature (JWKS for asymmetric keys, otherwise
    // via the Auth server). Never trust getSession() on the server.
    const { data, error } = token ? await client.auth.getClaims(token) : await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims || typeof claims.sub !== 'string' || !claims.sub) return null;
    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined, anonymous: claims.is_anonymous === true };
  } catch {
    return null;
  }
}

/**
 * Authenticates an API request via `Authorization: Bearer <access token>`
 * (mobile) or the Supabase session cookie (web), then loads the profile.
 * A present-but-invalid bearer token is rejected (no cookie fallback).
 */
export async function requireUser(request: Request): Promise<RequireUserResult> {
  const unauthorized = (msg = 'Sign in required.') => ({ ok: false as const, response: apiError(401, 'UNAUTHORIZED', msg) });
  const header = request.headers.get('authorization');

  // No credentials at all is always 401 (even on a server without Supabase);
  // credentials we cannot verify because the server is unconfigured are 503.
  if (!isAuthConfigured()) return header ? { ok: false, response: notConfigured() } : unauthorized();
  const repo = getRepository();
  if (!repo) return { ok: false, response: notConfigured() };

  let claims: Awaited<ReturnType<typeof verifiedClaims>>;
  let via: AuthedUser['via'];
  if (header) {
    const token = BEARER.exec(header.trim())?.[1];
    if (!token) return unauthorized('Malformed Authorization header. Expected "Bearer <access token>".');
    const verifier = createTokenVerifier();
    if (!verifier) return { ok: false, response: notConfigured() };
    claims = await verifiedClaims(verifier, token);
    via = 'bearer';
  } else {
    const client = await createCookieClient();
    if (!client) return { ok: false, response: notConfigured() };
    claims = await verifiedClaims(client);
    via = 'cookie';
  }

  if (!claims) return unauthorized(header ? 'Invalid or expired access token.' : 'Sign in required.');
  if (claims.anonymous) {
    return { ok: false, response: apiError(403, 'FORBIDDEN', 'Anonymous sessions cannot use this endpoint.') };
  }

  let profile: ProfileRow | null;
  try {
    profile = await repo.getProfileByAuthId(claims.sub);
  } catch (err) {
    console.error('[requireUser] profile lookup failed', err);
    return { ok: false, response: internalError() };
  }
  if (!profile) {
    return { ok: false, response: apiError(404, 'PROFILE_NOT_FOUND', 'No hunter profile exists for this account yet.') };
  }
  return { ok: true, user: { authId: claims.sub, email: claims.email, profile, repo, via } };
}

/** 403 response when the user's DB role lacks `permission`, else null. */
export function forbidUnless(user: AuthedUser, permission: UserPermission): Response | null {
  return hasPermission(user.profile.role, permission)
    ? null
    : apiError(403, 'FORBIDDEN', `Your role (${user.profile.role}) lacks the ${permission} permission.`);
}

/** 429 response when the user's bucket in `limiter` (default: mutations) is empty, else null. */
export function rateLimit(user: AuthedUser, limiter: RateLimiter = mutationLimiter): Response | null {
  const r = limiter.take(user.profile.id);
  return r.allowed
    ? null
    : apiError(429, 'RATE_LIMITED', 'Too many requests. Slow down.', { headers: { 'Retry-After': String(r.retryAfterSeconds) } });
}
