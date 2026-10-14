import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuraFitApp } from '@/components/AuraFitApp';
import { ToastProvider } from '@/components/ui/Toast';
import { getViewer } from '@/lib/auth/viewer';
import { onboardingRedirect } from '@/lib/onboarding/gate';
import { isAuthConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Arena', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Signed-in arena (server-backed). middleware.ts already redirects signed-out
 * users; this re-checks with a verified session (defense in depth) and sends users who
 * have not finished onboarding to /onboarding.
 */
export default async function ArenaPage() {
  if (!isAuthConfigured()) redirect('/login');
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/arena');
  const gate = onboardingRedirect('/arena', viewer);
  if (gate) redirect(gate);
  return (
    <ToastProvider>
      <AuraFitApp page="arena" viewer={viewer} />
    </ToastProvider>
  );
}
