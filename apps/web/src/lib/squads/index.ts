import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseSquadRepository } from './supabase-repository';
import type { SquadRepository } from './types';

export type * from './types';

let cached: { client: unknown; repo: SquadRepository } | null = null;

/** The server's SquadRepository, or null when Supabase URL / secret key are not configured. */
export function getSquadRepository(): SquadRepository | null {
  const client = createAdminClient();
  if (!client) return null;
  if (cached?.client !== client) cached = { client, repo: createSupabaseSquadRepository(client) };
  return cached.repo;
}
