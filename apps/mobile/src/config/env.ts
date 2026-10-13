import { resolveEnv, resolveSiteUrl } from './resolveEnv';

/**
 * EXPO_PUBLIC_* values are inlined at build time, and only when accessed as literal
 * `process.env.EXPO_PUBLIC_X` member expressions — do not destructure or index dynamically.
 * These values are public by design (they ship in the bundle); never put secrets here.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

export const env = resolveEnv({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  // Prefer the publishable key; fall back to the legacy anon key name for compatibility.
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiUrl,
  enableGoogleAuth: process.env.EXPO_PUBLIC_ENABLE_GOOGLE_AUTH,
});

export const isBackendConfigured = env.mode === 'backend';

/** Web site origin (same as the API origin); hosts /terms and /privacy. Null when not configured. */
export const siteUrl = resolveSiteUrl(apiUrl);

if (__DEV__ && env.mode === 'demo') {
  console.info(`[aurafit] Demo mode: ${env.reason}`);
}
