const FALLBACK_URL = 'https://aurafit.app';

/** Canonical public origin (NEXT_PUBLIC_APP_URL), used for sitemap, robots and structured data. */
export function siteOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || FALLBACK_URL).origin;
  } catch {
    return FALLBACK_URL;
  }
}
