import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthNotConfigured, AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, SignupForm } from '@/components/auth/forms';
import { isGoogleEnabled } from '@/lib/auth/settings';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Sign up', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const configured = isAuthConfigured();
  const google = configured && (await isGoogleEnabled());
  return (
    <AuthShell
      title="Start your hunter journey"
      lede="Create an account to keep your Aura, streak and rank safe on every device."
      footer={
        configured ? (
          <>
            Already have an account? <Link href="/login">Log in</Link>
          </>
        ) : undefined
      }
    >
      {!configured ? (
        <AuthNotConfigured />
      ) : (
        <>
          {google && (
            <>
              <GoogleButton next="/arena" label="Sign up with Google" />
              <p className="auth-divider">or</p>
            </>
          )}
          <SignupForm />
          <p className="auth-legal-note">
            By creating an account you agree to the <Link href="/terms">Terms of Service</Link> and acknowledge the{' '}
            <Link href="/privacy">Privacy Policy</Link>. AuraFit is not medical advice.
          </p>
        </>
      )}
    </AuthShell>
  );
}
