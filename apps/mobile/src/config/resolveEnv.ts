/**
 * Pure env resolution (no React Native imports, so it is unit-testable in Node).
 *
 * The app only talks to a backend when *all three* values are present and well-formed. Anything
 * less puts the app in "demo mode": the original local-only experience backed by seed data.
 */
export interface RawEnv {
  supabaseUrl?: string;
  /** New-style publishable key (`sb_publishable_...`) or a legacy anon JWT. Never a secret key. */
  supabaseKey?: string;
  apiUrl?: string;
  enableGoogleAuth?: string;
}

export type ResolvedEnv =
  | {
      mode: 'backend';
      supabaseUrl: string;
      supabaseKey: string;
      apiUrl: string;
      enableGoogleAuth: boolean;
    }
  | { mode: 'demo'; reason: string };

function cleanUrl(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!/^https?:\/\/[^\s/]+/i.test(v)) return null;
  return v.replace(/\/+$/, '');
}

export function resolveEnv(raw: RawEnv): ResolvedEnv {
  const supabaseUrl = cleanUrl(raw.supabaseUrl);
  const apiUrl = cleanUrl(raw.apiUrl);
  const supabaseKey = raw.supabaseKey?.trim() ?? '';

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) missing.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!apiUrl) missing.push('EXPO_PUBLIC_API_URL');
  if (missing.length > 0) return { mode: 'demo', reason: `Missing or invalid: ${missing.join(', ')}` };

  // A secret / service_role key must never ship in a client bundle. Refuse to use it.
  if (supabaseKey.startsWith('sb_secret_') || isServiceRoleJwt(supabaseKey)) {
    return { mode: 'demo', reason: 'Refusing to use a secret/service_role key in the app' };
  }

  return {
    mode: 'backend',
    supabaseUrl: supabaseUrl!,
    supabaseKey,
    apiUrl: apiUrl!,
    enableGoogleAuth: raw.enableGoogleAuth === 'true' || raw.enableGoogleAuth === '1',
  };
}

function isServiceRoleJwt(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : '';
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}
