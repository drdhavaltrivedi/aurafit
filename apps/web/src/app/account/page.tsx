import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DeleteAccountPanel } from '@/components/account/DeleteAccountPanel';
import { PageShell } from '@/components/shell/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { getViewer } from '@/lib/auth/viewer';
import { ROLE_META } from '@/lib/roles';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Account', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Signed-in account page (middleware also guards /account). */
export default async function AccountPage() {
  if (!isAuthConfigured()) redirect('/login');
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/account');
  const role = ROLE_META[viewer.role];

  return (
    <PageShell viewer={viewer}>
      <div className="container account">
        <div>
          <p className="eyebrow text-accent">Settings</p>
          <h1 className="page-title">Your account</h1>
        </div>

        <Card as="section" aria-labelledby="account-details-title">
          <CardHeader titleId="account-details-title" title="Account details" subtitle="Your sign-in email stays private. Your handle and role are public." />
          <dl className="account__details">
            <div>
              <dt>Email</dt>
              <dd>{viewer.email ?? 'Not available'}</dd>
            </div>
            <div>
              <dt>Handle</dt>
              <dd>{viewer.handle}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>
                <Badge tone={role.tone} outline>
                  {role.short}
                </Badge>
              </dd>
            </div>
          </dl>
          <p className="text-sm text-secondary">
            Back to <Link href="/arena" className="auth-link">your arena</Link>. Read how we handle your data in the{' '}
            <Link href="/privacy" className="auth-link">Privacy Policy</Link>.
          </p>
        </Card>

        <DeleteAccountPanel handle={viewer.handle} />
      </div>
    </PageShell>
  );
}
