import { ADMIN_USERS_PAGE_SIZE, normalizeUserSearch } from '@aurafit/shared';
import { json } from '@/lib/api/http';
import { adminContext, adminReadLimiter, forbiddenByDb, guarded, validationFailed } from '@/lib/moderation/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/users?q=&after=<handle> (ADMIN, AUDIT_ANTI_CHEAT) → AdminUsersResponse
 * Searches handle / username (empty q lists everyone), ordered by handle (keyset via nextAfter).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminContext(request, 'AUDIT_ANTI_CHEAT', adminReadLimiter);
  if (ctx instanceof Response) return ctx;
  const params = new URL(request.url).searchParams;
  const query = normalizeUserSearch(params.get('q') ?? '');
  const after = params.get('after');
  if (after !== null && !/^@?[A-Za-z0-9_.-]{1,50}$/.test(after)) return validationFailed({ after: 'Invalid cursor.' });
  return guarded('GET /api/v1/admin/users', async () => {
    const r = await ctx.repo.searchUsers(ctx.user.profile.id, query, ADMIN_USERS_PAGE_SIZE, after || null);
    return r.status === 'ok' ? json(r.page) : forbiddenByDb();
  });
}
