'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseConfig } from './env';

/** Browser Supabase client, or null when auth is not configured. */
export function createClient(): SupabaseClient | null {
  const config = getPublicSupabaseConfig();
  return config ? createBrowserClient(config.url, config.key) : null;
}
