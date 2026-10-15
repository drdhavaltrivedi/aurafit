import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseCreatorRepository } from './supabase-repository';
import type { CreatorRepository } from './types';

export type * from './types';

let cached: { client: unknown; repo: CreatorRepository } | null = null;

/** The server's CreatorRepository, or null when Supabase URL / secret key are not configured. */
export function getCreatorRepository(): CreatorRepository | null {
  const client = createAdminClient();
  if (!client) return null;
  if (cached?.client !== client) cached = { client, repo: createSupabaseCreatorRepository(client) };
  return cached.repo;
}
