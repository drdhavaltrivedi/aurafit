import { describe, expect, it } from 'vitest';
import { normalizeEmail, safeNextPath, validateEmail, validateLogin, validateNewPassword, validateSignup } from './validation';

describe('auth validation', () => {
  it('normalises and validates emails', () => {
    expect(normalizeEmail('  Jin@Example.COM ')).toBe('jin@example.com');
    expect(normalizeEmail(undefined)).toBe('');
    expect(validateEmail('jin@example.com')).toBeUndefined();
    for (const bad of ['', 'jin', 'jin@', '@x.com', 'jin@x', 'a b@x.com']) expect(validateEmail(bad), bad).toBeDefined();
  });

  it('enforces password rules: min 8, max 72 bytes, not blank', () => {
    expect(validateNewPassword('')).toMatch(/Create/);
    expect(validateNewPassword('1234567')).toMatch(/at least 8/);
    expect(validateNewPassword('12345678')).toBeUndefined();
    expect(validateNewPassword('        ')).toMatch(/spaces/);
    expect(validateNewPassword('é'.repeat(37))).toMatch(/at most 72/); // 74 bytes
  });

  it('validates login and signup forms', () => {
    expect(validateLogin({ email: 'jin@example.com', password: 'x' })).toEqual({});
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: expect.any(String), password: expect.any(String) });
    expect(validateSignup({ email: 'jin@example.com', password: 'longenough', confirm: 'longenough' })).toEqual({});
    expect(validateSignup({ email: 'jin@example.com', password: 'longenough', confirm: 'different' })).toEqual({
      confirm: 'Passwords do not match.',
    });
    expect(validateSignup({ email: 'x', password: 'short', confirm: '' })).toEqual({
      email: expect.any(String),
      password: expect.any(String),
      confirm: expect.any(String),
    });
  });

  it('safeNextPath only allows same-origin relative paths', () => {
    expect(safeNextPath('/arena?tab=quests#top')).toBe('/arena?tab=quests#top');
    expect(safeNextPath('/reset-password')).toBe('/reset-password');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, '/\u0000x', 'arena']) {
      expect(safeNextPath(bad), String(bad)).toBe('/arena');
    }
    expect(safeNextPath('//evil.com', '/')).toBe('/');
  });
});
