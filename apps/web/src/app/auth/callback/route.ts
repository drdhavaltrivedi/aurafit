import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { originFromHeaders } from '@/lib/auth/origin';
import { safeNextPath } from '@/lib/auth/validation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * Auth redirect target for OAuth (PKCE `code`), email confirmation and
 * password recovery links (either `code` or `token_hash` + `type`).
 * Exchanges the credential for a session cookie, then redirects to `next`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const origin = originFromHeaders(request.headers);
  const type = searchParams.get('type');
  const next = safeNextPath(searchParams.get('next'), type === 'recovery' ? '/reset-password' : '/arena');
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  };

  // Provider-reported errors (e.g. user cancelled consent, provider disabled).
  if (searchParams.get('error')) return fail('auth_failed');

  const supabase = await createClient();
  if (!supabase) return fail('not_configured');

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail('link_invalid');
    } else if (tokenHash && type && (OTP_TYPES as readonly string[]).includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
      if (error) return fail('link_invalid');
    } else {
      return fail('link_invalid');
    }
  } catch {
    return fail('auth_failed');
  }

  const res = NextResponse.redirect(`${origin}${next}`);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
