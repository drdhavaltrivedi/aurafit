import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseConfig } from './env';

/** Secret key (sb_secret_…), or the legacy service_role JWT. Server only — bypasses RLS. */
export function getSecretKey(): string {
  return (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

let cached: { key: string; client: SupabaseClient } | null = null;

/**
 * Privileged client for trusted server code (game actions, repository).
 * Never import from client components — `server-only` makes that a build error.
 * Returns null when the URL or secret key is missing.
 */
export function createAdminClient(): SupabaseClient | null {
  const config = getPublicSupabaseConfig();
  const secret = getSecretKey();
  if (!config || !secret) return null;
  const cacheKey = `${config.url}|${secret}`;
  if (cached?.key === cacheKey) return cached.client;
  const client = createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  cached = { key: cacheKey, client };
  return client;
}

/**
 * Stateless client used only to verify a caller-supplied access token
 * (`Authorization: Bearer …`) with auth.getClaims(token). Uses the publishable key.
 */
export function createTokenVerifier(): SupabaseClient | null {
  const config = getPublicSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
