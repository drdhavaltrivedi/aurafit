import 'server-only';
import type { UserRole } from '@aurafit/shared';
import { getSessionClaims, createClient } from '@/lib/supabase/server';
import { isAuthConfigured } from '@/lib/supabase/env';

/** Minimal signed-in user info for the header (serialisable for client components). */
export interface Viewer {
  email?: string;
  handle: string;
  username: string;
  avatarUrl: string;
  role: UserRole;
}

/**
 * Current viewer from the verified cookie session (getClaims), plus display
 * fields from their profile (public read via RLS). null when signed out or
 * auth is not configured. Never throws.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!isAuthConfigured()) return null;
  const supabase = await createClient();
  const claims = await getSessionClaims(supabase);
  if (!supabase || !claims) return null;
  const fallback: Viewer = {
    email: claims.email,
    handle: claims.email ? `@${claims.email.split('@')[0]}` : '@hunter',
    username: claims.email?.split('@')[0] ?? 'Hunter',
    avatarUrl: '',
    role: 'MEMBER',
  };
  try {
    const { data } = await supabase
      .from('profiles')
      .select('handle, username, avatar_url, role')
      .eq('auth_id', claims.sub)
      .maybeSingle();
    if (!data) return fallback;
    return { email: claims.email, handle: data.handle, username: data.username, avatarUrl: data.avatar_url ?? '', role: data.role };
  } catch {
    return fallback;
  }
}
