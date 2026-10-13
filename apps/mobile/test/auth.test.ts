import { describe, expect, it } from 'vitest';
import { parseAuthRedirect } from '../src/auth/authLinks';
import {
  friendlyAuthError,
  hasErrors,
  validateEmail,
  validateLogin,
  validatePasswordReset,
  validateSignup,
} from '../src/auth/validation';
import { resolveEnv } from '../src/config/resolveEnv';

describe('auth validation', () => {
  it('validates email', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('nope')).toBeDefined();
    expect(validateEmail('a@b')).toBeDefined();
    expect(validateEmail('  hunter@aurafit.app ')).toBeUndefined();
  });

  it('requires password on login but no length rule', () => {
    expect(validateLogin({ email: 'a@b.co', password: '' })).toEqual({ password: 'Enter your password.' });
    expect(hasErrors(validateLogin({ email: 'a@b.co', password: 'x' }))).toBe(false);
  });

  it('enforces min length and confirmation on sign-up', () => {
    const e = validateSignup({ email: 'a@b.co', password: 'short', confirm: 'short' });
    expect(e.password).toMatch(/8/);
    expect(e.confirm).toBeUndefined();
    const mismatch = validateSignup({ email: 'a@b.co', password: 'longenough', confirm: 'longenougH' });
    expect(mismatch.confirm).toBe('Passwords do not match.');
    expect(hasErrors(validateSignup({ email: 'a@b.co', password: 'longenough', confirm: 'longenough' }))).toBe(false);
  });

  it('rejects passwords over 72 bytes', () => {
    const pw = 'é'.repeat(40); // 80 bytes
    expect(validatePasswordReset({ password: pw, confirm: pw }).password).toMatch(/72/);
  });

  it('keeps login failures generic', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Email or password is incorrect.'
    );
    expect(friendlyAuthError({ status: 429, message: 'x' })).toMatch(/Too many/);
  });
});

describe('parseAuthRedirect', () => {
  it('parses a PKCE recovery link', () => {
    expect(parseAuthRedirect('aurafit://reset-password?code=abc123&sb_flow_id=flow_12345678')).toEqual({
      kind: 'code',
      code: 'abc123',
      flowId: 'flow_12345678',
      path: 'reset-password',
      isRecovery: true,
    });
  });

  it('parses implicit tokens in the fragment', () => {
    const r = parseAuthRedirect('aurafit://auth-callback#access_token=at&refresh_token=rt&type=recovery');
    expect(r).toMatchObject({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt', isRecovery: true });
  });

  it('parses Expo Go style URLs', () => {
    const r = parseAuthRedirect('exp://192.168.1.2:8081/--/reset-password?code=xyz');
    expect(r).toMatchObject({ kind: 'code', code: 'xyz', path: 'reset-password', isRecovery: true });
  });

  it('parses error links', () => {
    const r = parseAuthRedirect(
      'aurafit://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(r).toEqual({
      kind: 'error',
      code: 'otp_expired',
      message: 'Email link is invalid or has expired',
      path: 'reset-password',
      isRecovery: true,
    });
  });

  it('ignores unrelated links and malformed input', () => {
    expect(parseAuthRedirect('aurafit://quests/123')).toBeNull();
    expect(parseAuthRedirect(null)).toBeNull();
    expect(parseAuthRedirect('aurafit://x?code=%E0%A4%A')).toBeNull();
  });
});

describe('resolveEnv', () => {
  const ok = { supabaseUrl: 'https://x.supabase.co/', supabaseKey: 'sb_publishable_abc', apiUrl: 'http://localhost:3000' };

  it('enables backend mode only with all values', () => {
    expect(resolveEnv(ok)).toMatchObject({ mode: 'backend', supabaseUrl: 'https://x.supabase.co', apiUrl: 'http://localhost:3000' });
    expect(resolveEnv({ ...ok, apiUrl: '' })).toMatchObject({ mode: 'demo' });
    expect(resolveEnv({})).toMatchObject({ mode: 'demo' });
    expect(resolveEnv({ ...ok, supabaseUrl: 'not a url' })).toMatchObject({ mode: 'demo' });
  });

  it('refuses secret keys', () => {
    expect(resolveEnv({ ...ok, supabaseKey: 'sb_secret_123' })).toMatchObject({ mode: 'demo' });
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(resolveEnv({ ...ok, supabaseKey: `eyJhbGciOiJIUzI1NiJ9.${payload}.sig` })).toMatchObject({ mode: 'demo' });
  });
});
