/** Pure form validation for the auth screens (unit-tested; no React Native imports). */

export const PASSWORD_MIN_LENGTH = 8;
/** Supabase Auth rejects passwords longer than 72 bytes (bcrypt limit). */
export const PASSWORD_MAX_LENGTH = 72;

// Deliberately permissive: the server is the source of truth, this only catches typos early.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | undefined {
  const v = email.trim();
  if (!v) return 'Enter your email address.';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (!password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (utf8Length(password) > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  return undefined;
}

export function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Confirm your password.';
  if (password !== confirm) return 'Passwords do not match.';
  return undefined;
}

type LoginField = 'email' | 'password';
export function validateLogin(input: { email: string; password: string }): FieldErrors<LoginField> {
  const errors: FieldErrors<LoginField> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = 'Enter your password.';
  return errors;
}

type SignupField = 'email' | 'password' | 'confirm';
export function validateSignup(input: {
  email: string;
  password: string;
  confirm: string;
}): FieldErrors<SignupField> {
  const errors: FieldErrors<SignupField> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validateNewPassword(input.password);
  if (password) errors.password = password;
  const confirm = validateConfirm(input.password, input.confirm);
  if (confirm) errors.confirm = confirm;
  return errors;
}

type ResetField = 'password' | 'confirm';
export function validatePasswordReset(input: { password: string; confirm: string }): FieldErrors<ResetField> {
  const errors: FieldErrors<ResetField> = {};
  const password = validateNewPassword(input.password);
  if (password) errors.password = password;
  const confirm = validateConfirm(input.password, input.confirm);
  if (confirm) errors.confirm = confirm;
  return errors;
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(Boolean);
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/**
 * Maps Supabase Auth errors to user-facing copy. Login failures intentionally stay generic so the
 * app does not reveal whether an email is registered.
 */
export function friendlyAuthError(err: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!err) return 'Something went wrong. Please try again.';
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Confirm your email first — check your inbox for the link.';
  }
  if (code === 'weak_password' || msg.includes('weak password')) {
    return 'That password is too weak. Try a longer one with mixed characters.';
  }
  if (code === 'same_password') return 'Choose a password different from your current one.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    return 'An account with this email already exists. Try logging in.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }
  return err.message || 'Something went wrong. Please try again.';
}
