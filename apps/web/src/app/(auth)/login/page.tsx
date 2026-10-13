import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthNotConfigured, AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, LoginForm } from '@/components/auth/forms';
import { isGoogleEnabled } from '@/lib/auth/settings';
import { safeNextPath } from '@/lib/auth/validation';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  not_configured: 'Accounts are not configured on this server yet.',
  oauth_unavailable: 'Google sign-in is not available right now. Use email and password instead.',
  link_invalid: 'That sign-in link is invalid or has expired. Try again or request a new link.',
  auth_failed: 'Sign-in was cancelled or failed. Please try again.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined);
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined;
  const configured = isAuthConfigured();
  const google = configured && (await isGoogleEnabled());
  const signupHref = next === '/arena' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell
      title="Welcome back, Hunter"
      lede="Log in to sync your Aura, streak and quests across web and mobile."
      footer={
        configured ? (
          <>
            New to AuraFit? <Link href={signupHref}>Create an account</Link>
          </>
        ) : undefined
      }
    >
      {!configured ? (
        <AuthNotConfigured />
      ) : (
        <>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          {google && (
            <>
              <GoogleButton next={next} />
              <p className="auth-divider">or</p>
            </>
          )}
          <LoginForm next={next} />
        </>
      )}
    </AuthShell>
  );
}
