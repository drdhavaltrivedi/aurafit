import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseNotificationRepository } from './supabase-repository';
import type { NotificationRepository } from './types';

export type * from './types';

let cached: { client: unknown; repo: NotificationRepository } | null = null;

/** The server's NotificationRepository, or null when Supabase URL / secret key are not configured. */
export function getNotificationRepository(): NotificationRepository | null {
  const client = createAdminClient();
  if (!client) return null;
  if (cached?.client !== client) cached = { client, repo: createSupabaseNotificationRepository(client) };
  return cached.repo;
}
