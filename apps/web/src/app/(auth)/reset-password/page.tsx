import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthNotConfigured, AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/forms';
import { isAuthConfigured } from '@/lib/supabase/env';
import { getSessionClaims } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Reached from the recovery email via /auth/callback, which establishes a session. */
export default async function ResetPasswordPage() {
  const configured = isAuthConfigured();
  const claims = configured ? await getSessionClaims() : null;
  return (
    <AuthShell title="Choose a new password" lede="Pick something you haven't used before.">
      {!configured ? (
        <AuthNotConfigured />
      ) : claims ? (
        <ResetPasswordForm />
      ) : (
        <div className="stack-3">
          <p className="alert alert--error" role="alert">
            This reset link is invalid or has expired.
          </p>
          <Link href="/forgot-password" className="btn btn--primary btn--lg btn--block">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
