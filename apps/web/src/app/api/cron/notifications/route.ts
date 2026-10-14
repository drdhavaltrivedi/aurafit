import { apiError, internalError, json, notConfigured } from '@/lib/api/http';
import { getNotificationRepository } from '@/lib/notifications';
import { getCronSecret, isAuthorizedCronRequest } from '@/lib/notifications/cron-auth';
import { runNotificationCron } from '@/lib/notifications/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/cron/notifications (Authorization: Bearer <CRON_SECRET>).
 * Called hourly at minute 0 by Supabase pg_cron + pg_net (see the 20261014110000_push
 * migration); Vercel Hobby crons only run daily. Responds with counts only.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getCronSecret();
  if (!secret) return apiError(503, 'NOT_CONFIGURED', 'CRON_SECRET is not configured on this server.');
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), secret)) {
    return apiError(401, 'UNAUTHORIZED', 'Invalid cron credentials.');
  }
  const repo = getNotificationRepository();
  if (!repo) return notConfigured();
  try {
    const result = await runNotificationCron({
      repo,
      now: new Date(),
      accessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || undefined,
    });
    return json(result);
  } catch (err) {
    console.error('[POST /api/cron/notifications]', err);
    return internalError();
  }
}
