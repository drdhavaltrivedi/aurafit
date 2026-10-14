import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicSupabaseConfig } from './env';

/** Routes that require a signed-in user (redirect to /login otherwise). */
export const PROTECTED_PREFIXES = ['/arena', '/account', '/onboarding'] as const;
/** Auth pages a signed-in user should not see (redirect to /arena). */
export const GUEST_ONLY_PATHS = ['/login', '/signup'] as const;

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Refreshes the Supabase session cookie on every request and applies route
 * guards. Follows the official @supabase/ssr Next.js pattern: no code between
 * createServerClient() and auth.getClaims(), and always return the response
 * object that setAll() last built (it carries the refreshed cookies).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = getPublicSupabaseConfig();
  // Auth not configured: nothing to refresh; pages render a "not configured" state.
  if (!config) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    signedIn = false; // Auth unreachable: treat as signed out, never crash.
  }

  const path = request.nextUrl.pathname;
  const redirectTo = (pathname: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = '';
    if (next) url.searchParams.set('next', next);
    const res = NextResponse.redirect(url);
    // Keep refreshed cookies + cache headers on the redirect.
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    for (const h of ['cache-control', 'expires', 'pragma']) {
      const v = supabaseResponse.headers.get(h);
      if (v) res.headers.set(h, v);
    }
    return res;
  };

  if (!signedIn && PROTECTED_PREFIXES.some((p) => matches(path, p))) {
    return redirectTo('/login', path + request.nextUrl.search);
  }
  if (signedIn && GUEST_ONLY_PATHS.some((p) => matches(path, p))) {
    return redirectTo('/arena');
  }
  return supabaseResponse;
}
