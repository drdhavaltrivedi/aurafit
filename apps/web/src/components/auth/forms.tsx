'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, LogIn, Mail, UserPlus } from 'lucide-react';
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signInWithGoogleAction,
  signUpAction,
} from '@/lib/auth/actions';
import { INITIAL_AUTH_STATE, type AuthFormState } from '@/lib/auth/form-state';
import {
  PASSWORD_MIN,
  hasErrors,
  normalizeEmail,
  validateEmail,
  validateLogin,
  validatePasswordPair,
  validateSignup,
  type AuthField,
  type FieldErrors,
} from '@/lib/auth/validation';
import { FormAlert, PasswordField, SubmitButton, TextField } from './fields';

type Action = (prev: AuthFormState, fd: FormData) => Promise<AuthFormState>;
const ORDER: AuthField[] = ['email', 'password', 'confirm'];

function focusFirstInvalid(form: HTMLFormElement | null, e: FieldErrors) {
  const first = ORDER.find((k) => e[k]);
  if (first) form?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
}

/**
 * Shared behaviour: client-side validation before submit (server re-validates),
 * inline field errors, focus on the first invalid field, pending state.
 */
function useAuthForm(action: Action, validate: (fd: FormData) => FieldErrors) {
  const [state, formAction] = useActionState(action, INITIAL_AUTH_STATE);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const errors: FieldErrors = { ...state.fieldErrors, ...clientErrors };

  useEffect(() => {
    if (state.fieldErrors) focusFirstInvalid(formRef.current, state.fieldErrors);
  }, [state]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const next = validate(new FormData(e.currentTarget));
    setClientErrors(next);
    if (hasErrors(next)) {
      e.preventDefault();
      focusFirstInvalid(formRef.current, next);
    }
  };

  const clear = (k: AuthField) => () => {
    if (clientErrors[k]) setClientErrors((p) => ({ ...p, [k]: undefined }));
  };

  return { state, formAction, errors, formRef, onSubmit, clear };
}

const v = (fd: FormData, k: string) => String(fd.get(k) ?? '');

export function LoginForm({ next }: { next: string }) {
  const { state, formAction, errors, formRef, onSubmit, clear } = useAuthForm(signInAction, (fd) =>
    validateLogin({ email: normalizeEmail(fd.get('email')), password: v(fd, 'password') }),
  );
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="form">
      <input type="hidden" name="next" value={next} />
      <TextField
        id="login-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={errors.email}
        onChange={clear('email')}
      />
      <PasswordField
        id="login-password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        error={errors.password}
        onChange={clear('password')}
      />
      <div className="auth-row">
        <span />
        <Link href="/forgot-password" className="auth-link text-sm">
          Forgot password?
        </Link>
      </div>
      <FormAlert status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Signing in…" leadingIcon={<LogIn />}>
        Log in
      </SubmitButton>
    </form>
  );
}

export function SignupForm() {
  const { state, formAction, errors, formRef, onSubmit, clear } = useAuthForm(signUpAction, (fd) =>
    validateSignup({ email: normalizeEmail(fd.get('email')), password: v(fd, 'password'), confirm: v(fd, 'confirm') }),
  );
  if (state.status === 'success') {
    return <FormAlert status="success" message={state.message} />;
  }
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="form">
      <TextField
        id="signup-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={errors.email}
        onChange={clear('email')}
      />
      <PasswordField
        id="signup-password"
        name="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={errors.password}
        onChange={clear('password')}
      />
      <PasswordField
        id="signup-confirm"
        name="confirm"
        label="Confirm password"
        autoComplete="new-password"
        required
        error={errors.confirm}
        onChange={clear('confirm')}
      />
      <FormAlert status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Creating account…" leadingIcon={<UserPlus />}>
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, formAction, errors, formRef, onSubmit, clear } = useAuthForm(forgotPasswordAction, (fd) => {
    const e = validateEmail(normalizeEmail(fd.get('email')));
    return e ? { email: e } : {};
  });
  if (state.status === 'success') return <FormAlert status="success" message={state.message} />;
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="form">
      <TextField
        id="forgot-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.email}
        error={errors.email}
        onChange={clear('email')}
      />
      <FormAlert status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Sending link…" leadingIcon={<Mail />}>
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const { state, formAction, errors, formRef, onSubmit, clear } = useAuthForm(resetPasswordAction, (fd) =>
    validatePasswordPair({ password: v(fd, 'password'), confirm: v(fd, 'confirm') }),
  );
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="form">
      <PasswordField
        id="reset-password"
        name="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={errors.password}
        onChange={clear('password')}
      />
      <PasswordField
        id="reset-confirm"
        name="confirm"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={errors.confirm}
        onChange={clear('confirm')}
      />
      <FormAlert status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Saving…" leadingIcon={<KeyRound />}>
        Update password
      </SubmitButton>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/** Starts the Google OAuth (PKCE) flow; redirectTo = <origin>/auth/callback. */
export function GoogleButton({ next, label = 'Continue with Google' }: { next: string; label?: string }) {
  return (
    <form action={signInWithGoogleAction}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton variant="secondary" pendingLabel="Redirecting to Google…" leadingIcon={<GoogleIcon />}>
        {label}
      </SubmitButton>
    </form>
  );
}
