/**
 * Pure parsing of Supabase auth redirect URLs (unit-tested; no React Native imports).
 *
 * Handles:
 *  - PKCE:     aurafit://reset-password?code=...&sb_flow_id=...
 *  - Implicit: aurafit://reset-password#access_token=...&refresh_token=...&type=recovery
 *  - Errors:   aurafit://reset-password#error=access_denied&error_code=otp_expired&error_description=...
 */
export type AuthLinkResult =
  | { kind: 'code'; code: string; flowId: string | null; path: string; isRecovery: boolean }
  | { kind: 'tokens'; accessToken: string; refreshToken: string; path: string; isRecovery: boolean }
  | { kind: 'error'; code: string; message: string; path: string; isRecovery: boolean };

export const RESET_PASSWORD_PATH = 'reset-password';
export const AUTH_CALLBACK_PATH = 'auth-callback';

function parseParams(segment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of segment.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const rawKey = idx === -1 ? pair : pair.slice(0, idx);
    const rawVal = idx === -1 ? '' : pair.slice(idx + 1);
    try {
      out[decodeURIComponent(rawKey.replace(/\+/g, ' '))] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      // Malformed escape sequence: skip the pair rather than throwing on untrusted input.
    }
  }
  return out;
}

/** Extracts the path (without scheme/host for custom schemes, without leading slashes). */
function extractPath(url: string): string {
  const noFragment = url.split('#')[0].split('?')[0];
  const schemeIdx = noFragment.indexOf('://');
  if (schemeIdx === -1) return noFragment.replace(/^\/+/, '');
  const rest = noFragment.slice(schemeIdx + 3);
  const scheme = noFragment.slice(0, schemeIdx).toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'exp' || scheme === 'exps') {
    // host/path — drop the host; Expo Go URLs look like exp://host:port/--/reset-password
    const slash = rest.indexOf('/');
    const path = slash === -1 ? '' : rest.slice(slash + 1);
    return path.replace(/^--\//, '').replace(/\/+$/, '');
  }
  // Custom scheme: aurafit://reset-password → "reset-password" (host acts as first segment).
  return rest.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function parseAuthRedirect(url: string | null | undefined): AuthLinkResult | null {
  if (!url || typeof url !== 'string') return null;
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');
  const query =
    queryIdx === -1 ? '' : url.slice(queryIdx + 1, hashIdx !== -1 && hashIdx > queryIdx ? hashIdx : undefined);
  const fragment = hashIdx === -1 ? '' : url.slice(hashIdx + 1);
  const params = { ...parseParams(query), ...parseParams(fragment) };
  const path = extractPath(url);
  const isRecovery = path === RESET_PASSWORD_PATH || params.type === 'recovery';

  if (params.error || params.error_code) {
    return {
      kind: 'error',
      code: params.error_code || params.error,
      message: params.error_description || 'The link is invalid or has expired.',
      path,
      isRecovery,
    };
  }
  if (params.code) {
    return { kind: 'code', code: params.code, flowId: params.sb_flow_id || null, path, isRecovery };
  }
  if (params.access_token && params.refresh_token) {
    return {
      kind: 'tokens',
      accessToken: params.access_token,
      refreshToken: params.refresh_token,
      path,
      isRecovery,
    };
  }
  return null;
}
