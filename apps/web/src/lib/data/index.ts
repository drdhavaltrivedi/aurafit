import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseRepository } from './supabase-repository';
import type { GameRepository } from './types';

export type * from './types';

let cached: { client: unknown; repo: GameRepository } | null = null;

/** The server's GameRepository, or null when Supabase URL / secret key are not configured. */
export function getRepository(): GameRepository | null {
  const client = createAdminClient();
  if (!client) return null;
  if (cached?.client !== client) cached = { client, repo: createSupabaseRepository(client) };
  return cached.repo;
}
