import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseModerationRepository } from './supabase-repository';
import type { ModerationRepository } from './types';

export type * from './types';

let cached: { client: unknown; repo: ModerationRepository } | null = null;

/** The server's ModerationRepository, or null when Supabase URL / secret key are not configured. */
export function getModerationRepository(): ModerationRepository | null {
  const client = createAdminClient();
  if (!client) return null;
  if (cached?.client !== client) cached = { client, repo: createSupabaseModerationRepository(client) };
  return cached.repo;
}
