/**
 * Legal pages and disclaimers. Pure TypeScript (no React Native imports) so it is unit-testable.
 *
 * The Terms of Service and Privacy Policy are hosted by the web app at `${EXPO_PUBLIC_API_URL}/terms`
 * and `/privacy` (the API and the site share one origin).
 */
export type LegalDoc = 'terms' | 'privacy';

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

export const HEALTH_DISCLAIMER =
  'AuraFit is not medical advice. Check with a doctor before starting a new exercise program.';

/** Absolute URL of a legal page, or null when no site origin is configured (e.g. a demo-only build). */
export function legalUrl(siteUrl: string | null | undefined, doc: LegalDoc): string | null {
  const base = siteUrl?.trim().replace(/\/+$/, '');
  if (!base || !/^https?:\/\/[^\s/]+/i.test(base)) return null;
  return `${base}/${doc}`;
}
