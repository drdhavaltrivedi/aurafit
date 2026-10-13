/** Pure, isomorphic form validation for the auth pages (used client- and server-side). */

export const PASSWORD_MIN = 8;
/** bcrypt (used by Supabase Auth) only considers the first 72 bytes. */
export const PASSWORD_MAX = 72;
const EMAIL_MAX = 254;
// Pragmatic check; Supabase Auth performs the authoritative validation.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export type AuthField = 'email' | 'password' | 'confirm';
export type FieldErrors = Partial<Record<AuthField, string>>;

export function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function validateEmail(email: string): string | undefined {
  if (!email) return 'Enter your email address.';
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return 'Enter a valid email address, like name@example.com.';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (!password) return 'Create a password.';
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (password.trim().length === 0) return 'Password cannot be only spaces.';
  return undefined;
}

export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}

export function validatePasswordPair(input: { password: string; confirm: string }): FieldErrors {
  const errors: FieldErrors = {};
  const password = validateNewPassword(input.password);
  if (password) errors.password = password;
  if (!input.confirm) errors.confirm = 'Confirm your password.';
  else if (!password && input.confirm !== input.password) errors.confirm = 'Passwords do not match.';
  return errors;
}

export function validateSignup(input: { email: string; password: string; confirm: string }): FieldErrors {
  const errors: FieldErrors = { ...validatePasswordPair(input) };
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  return errors;
}

export const hasErrors = (e: FieldErrors) => Object.values(e).some(Boolean);

/**
 * Only same-origin relative paths are allowed as post-auth redirects
 * (prevents open redirects such as `//evil.com` or `/\evil.com`).
 */
export function safeNextPath(raw: unknown, fallback = '/arena'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid') return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
