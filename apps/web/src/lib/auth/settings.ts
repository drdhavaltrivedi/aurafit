import 'server-only';
import { getPublicSupabaseConfig } from '@/lib/supabase/env';

/**
 * Whether the Google provider is enabled, from the public GoTrue settings
 * endpoint. Unknown (network error) is treated as enabled so the button stays
 * available; Supabase reports a clear error if it is actually disabled.
 */
export async function isGoogleEnabled(): Promise<boolean> {
  const config = getPublicSupabaseConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return true;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return body.external?.google === true;
  } catch {
    return true;
  }
}
