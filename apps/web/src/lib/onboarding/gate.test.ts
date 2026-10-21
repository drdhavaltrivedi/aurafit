import { describe, expect, it } from 'vitest';
import { arenaStartHref, isOnboardingExempt, onboardingRedirect } from './gate';

describe('onboarding gate', () => {
  it('sends signed-in, not-onboarded users to /onboarding from app pages', () => {
    expect(onboardingRedirect('/arena', { onboarded: false })).toBe('/onboarding');
    expect(onboardingRedirect('/arena/anything', { onboarded: false })).toBe('/onboarding');
  });

  it('never redirects signed-out or onboarded viewers', () => {
    expect(onboardingRedirect('/arena', null)).toBeNull();
    expect(onboardingRedirect('/arena', { onboarded: true })).toBeNull();
  });

  it.each(['/onboarding', '/account', '/api/v1/me', '/auth/callback', '/privacy', '/terms', '/support', '/login', '/signup'])(
    'exempts %s',
    (path) => {
      expect(isOnboardingExempt(path)).toBe(true);
      expect(onboardingRedirect(path, { onboarded: false })).toBeNull();
    },
  );

  it('does not treat lookalike prefixes as exempt', () => {
    expect(isOnboardingExempt('/accounting')).toBe(false);
    expect(isOnboardingExempt('/apix')).toBe(false);
  });

  it('builds safe /arena start links', () => {
    expect(arenaStartHref('af_hiit_ignite_15')).toBe('/arena?start=af_hiit_ignite_15');
    expect(arenaStartHref(null)).toBe('/arena');
    expect(arenaStartHref('//evil.example')).toBe('/arena');
    expect(arenaStartHref('a b')).toBe('/arena');
  });
});
