/**
 * Supabase configuration from env vars. Every accessor reads at call time and
 * returns null/'' when unset, so the app runs (in demo mode) without credentials.
 *
 * NEXT_PUBLIC_* values are inlined at BUILD time: rebuild after changing them.
 * They must be referenced literally (process.env.NEXT_PUBLIC_X) for inlining.
 */
export interface PublicSupabaseConfig {
  url: string;
  /** Publishable key (sb_publishable_…) or the legacy anon JWT. Safe for browsers. */
  key: string;
}

function validUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? value.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = validUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return url && key ? { url, key } : null;
}

export function isAuthConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}
