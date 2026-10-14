/**
 * Onboarding gate: signed-in users whose profile is not onboarded are sent to /onboarding.
 * Enforced server-side by the signed-in app pages (currently /arena) using the verified
 * viewer's profile (`Viewer.onboarded`), not in middleware, so no extra database round trip
 * happens on every request. It is a UX gate, not an authorization boundary.
 */
export const ONBOARDING_PATH = '/onboarding';
export const POST_ONBOARDING_PATH = '/arena';

/** Paths never redirected to onboarding (the flow itself, account/deletion, APIs, auth, legal). */
export const ONBOARDING_EXEMPT_PREFIXES = [
  '/onboarding',
  '/account',
  '/api',
  '/auth',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
] as const;

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isOnboardingExempt(path: string): boolean {
  return ONBOARDING_EXEMPT_PREFIXES.some((p) => matches(path, p));
}

/** Where to send the viewer instead of `path`, or null to render it. */
export function onboardingRedirect(path: string, viewer: { onboarded: boolean } | null): string | null {
  if (!viewer || viewer.onboarded || isOnboardingExempt(path)) return null;
  return ONBOARDING_PATH;
}

/** Only internal drop ids may be forwarded to /arena?start=… */
export function arenaStartHref(dropId: string | null | undefined): string {
  return dropId && /^[A-Za-z0-9_-]{1,100}$/.test(dropId)
    ? `${POST_ONBOARDING_PATH}?start=${encodeURIComponent(dropId)}`
    : POST_ONBOARDING_PATH;
}
