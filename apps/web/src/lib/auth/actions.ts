'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthFormState } from './form-state';
import { authErrorMessage } from './messages';
import { originFromHeaders } from './origin';
import { hasErrors, normalizeEmail, safeNextPath, validateEmail, validateLogin, validatePasswordPair, validateSignup } from './validation';

const NOT_CONFIGURED: AuthFormState = {
  status: 'error',
  message: 'Accounts are not configured on this server yet. Try the demo instead.',
};

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
};

async function callbackUrl(next: string): Promise<string> {
  const origin = originFromHeaders(await headers());
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const password = str(formData, 'password');
  const next = safeNextPath(str(formData, 'next'));
  const fieldErrors = validateLogin({ email, password });
  if (hasErrors(fieldErrors)) return { status: 'error', fieldErrors, email, message: 'Fix the highlighted fields.' };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: 'error', message: authErrorMessage(error), email };
  redirect(next);
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const password = str(formData, 'password');
  const confirm = str(formData, 'confirm');
  const fieldErrors = validateSignup({ email, password, confirm });
  if (hasErrors(fieldErrors)) return { status: 'error', fieldErrors, email, message: 'Fix the highlighted fields.' };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await callbackUrl('/arena') },
  });
  if (error) return { status: 'error', message: authErrorMessage(error), email };
  // Email confirmation disabled → we already have a session.
  if (data.session) redirect('/arena');
  // Same message whether or not the address was already registered (no enumeration).
  return {
    status: 'success',
    email,
    message: `Check ${email} for a confirmation link to activate your account.`,
  };
}

export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const emailError = validateEmail(email);
  if (emailError) return { status: 'error', fieldErrors: { email: emailError }, email, message: 'Fix the highlighted fields.' };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: await callbackUrl('/reset-password') });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    return { status: 'error', message: authErrorMessage(error), email };
  }
  return {
    status: 'success',
    email,
    message: `If an account exists for ${email}, a password reset link is on its way.`,
  };
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = str(formData, 'password');
  const confirm = str(formData, 'confirm');
  const fieldErrors = validatePasswordPair({ password, confirm });
  if (hasErrors(fieldErrors)) return { status: 'error', fieldErrors, message: 'Fix the highlighted fields.' };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return { status: 'error', message: 'Your reset link has expired. Request a new one.' };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: 'error', message: authErrorMessage(error) };
  redirect('/arena');
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get('next'));
  const supabase = await createClient();
  if (!supabase) redirect('/login?error=not_configured');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: await callbackUrl(next) },
  });
  if (error || !data?.url) redirect('/login?error=oauth_unavailable');
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect('/');
}
