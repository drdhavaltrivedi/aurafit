import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from '../src/config/resolveEnv';
import { legalUrl } from '../src/lib/legal';

describe('legal links', () => {
  it('builds terms/privacy URLs on the site origin', () => {
    expect(legalUrl('https://aurafit.app', 'terms')).toBe('https://aurafit.app/terms');
    expect(legalUrl('https://aurafit.app/', 'privacy')).toBe('https://aurafit.app/privacy');
  });

  it('returns null without a usable origin', () => {
    expect(legalUrl(null, 'terms')).toBeNull();
    expect(legalUrl('', 'privacy')).toBeNull();
    expect(legalUrl('aurafit.app', 'privacy')).toBeNull();
  });

  it('resolves the site URL independently of backend mode', () => {
    expect(resolveSiteUrl(' https://aurafit.app// ')).toBe('https://aurafit.app');
    expect(resolveSiteUrl(undefined)).toBeNull();
    expect(resolveSiteUrl('javascript:alert(1)')).toBeNull();
  });
});
