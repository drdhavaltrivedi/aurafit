/**
 * Maps Supabase Auth errors to user-facing copy without leaking whether an
 * account exists (no "user not found" style messages).
 */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined): string {
  switch (error?.code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'email_not_confirmed':
      return 'Confirm your email first — check your inbox for the link.';
    case 'weak_password':
      return 'That password is too weak. Try a longer one.';
    case 'same_password':
      return 'Choose a password different from your current one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute and try again.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Email sign-up is currently disabled.';
    case 'provider_disabled':
    case 'validation_failed':
      return 'This sign-in method is not enabled yet.';
    case 'session_not_found':
    case 'session_expired':
      return 'Your session expired. Request a new link.';
  }
  if (error?.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return 'Something went wrong. Please try again.';
}
