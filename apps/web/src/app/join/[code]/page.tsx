import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isInviteCode, normalizeInviteCode, squadJoinPath } from '@aurafit/shared';
import { JoinSquadConfirm } from '@/components/squads/JoinSquadConfirm';
import { PageShell } from '@/components/shell/PageShell';
import { getViewer } from '@/lib/auth/viewer';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Join a squad', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * /join/<CODE>: squad invite link. Signed out → /login?next=/join/<CODE> (back here after login or
 * sign-up). Signed in → confirm, then POST /api/v1/squads/join. Malformed codes still render (with
 * an error) so the user can type the right one.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  const code = normalizeInviteCode(decoded).slice(0, 16);
  const valid = isInviteCode(code);
  if (!isAuthConfigured()) redirect('/login');
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(valid ? squadJoinPath(code) : '/arena')}`);

  return (
    <PageShell viewer={viewer}>
      <div className="container join-page">
        <JoinSquadConfirm code={valid ? code : null} />
      </div>
    </PageShell>
  );
}
