import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthNotConfigured, AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/forms';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

export default function ForgotPasswordPage() {
  const configured = isAuthConfigured();
  return (
    <AuthShell
      title="Forgot your password?"
      lede="Enter your email and we'll send you a link to choose a new one."
      footer={
        <>
          Remembered it? <Link href="/login">Back to log in</Link>
        </>
      }
    >
      {configured ? <ForgotPasswordForm /> : <AuthNotConfigured />}
    </AuthShell>
  );
}
