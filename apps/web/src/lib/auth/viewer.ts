import 'server-only';
import type { UserRole } from '@aurafit/shared';
import { getRepository } from '@/lib/data';
import { getSessionClaims, createClient } from '@/lib/supabase/server';
import { isAuthConfigured } from '@/lib/supabase/env';

/** Minimal signed-in user info for the header (serialisable for client components). */
export interface Viewer {
  email?: string;
  handle: string;
  username: string;
  avatarUrl: string;
  role: UserRole;
  /** False only when the profile exists and has not finished onboarding (see lib/onboarding/gate.ts). */
  onboarded: boolean;
}

/**
 * Current viewer from the verified cookie session (getClaims), plus display
 * fields from their profile. The profile is looked up server-side by auth id
 * with the secret key (clients cannot read profiles.auth_id through the Data
 * API). null when signed out or auth is not configured. Never throws.
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
    // Unknown profile state: never trap the user in onboarding.
    onboarded: true,
  };
  try {
    const data = await getRepository()?.getProfileByAuthId(claims.sub);
    if (!data) return fallback;
    return {
      email: claims.email,
      handle: data.handle,
      username: data.username,
      avatarUrl: data.avatar_url ?? '',
      role: data.role,
      onboarded: data.onboarded_at !== null,
    };
  } catch {
    return fallback;
  }
}
