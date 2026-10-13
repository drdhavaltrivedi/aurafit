import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getPublicSupabaseConfig } from './env';

/**
 * Cookie-bound Supabase client for Server Components, Server Actions and Route
 * Handlers (publishable key; acts as the signed-in user, subject to RLS).
 * Returns null when auth is not configured. Create one per request.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const config = getPublicSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component (read-only cookies). Safe to ignore:
          // middleware.ts refreshes sessions on every request.
        }
      },
    },
  });
}

export interface SessionClaims {
  sub: string;
  email?: string;
  isAnonymous: boolean;
}

/**
 * Verified identity of the cookie session (getClaims verifies the JWT
 * signature; never trust getSession() on the server). null when signed out.
 */
export async function getSessionClaims(supabase?: SupabaseClient | null): Promise<SessionClaims | null> {
  const client = supabase === undefined ? await createClient() : supabase;
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims || typeof claims.sub !== 'string') return null;
    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined, isAnonymous: claims.is_anonymous === true };
  } catch {
    return null;
  }
}
