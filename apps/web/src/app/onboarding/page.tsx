import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingFlow, type OnboardingDrop } from '@/components/onboarding/OnboardingFlow';
import { PageShell } from '@/components/shell/PageShell';
import { getViewer } from '@/lib/auth/viewer';
import { getRepository } from '@/lib/data';
import { POST_ONBOARDING_PATH } from '@/lib/onboarding/gate';
import { isAuthConfigured } from '@/lib/supabase/env';
import './onboarding.css';

export const metadata: Metadata = { title: 'Get started', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Catalog subset the finish screen needs to recommend and preview a first workout. */
async function loadDrops(): Promise<OnboardingDrop[]> {
  try {
    const drops = (await getRepository()?.listDrops()) ?? [];
    return drops.map((d) => ({
      id: d.id,
      title: d.title,
      tagline: d.tagline,
      durationMinutes: d.durationMinutes,
      difficulty: d.difficulty,
      category: d.category,
      coverGradient: d.coverGradient,
    }));
  } catch (err) {
    console.error('[onboarding] listing drops failed', err);
    return [];
  }
}

/** Signed-in onboarding (middleware also guards /onboarding). Finished users go to the arena. */
export default async function OnboardingPage() {
  if (!isAuthConfigured()) redirect('/login');
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/onboarding');
  if (viewer.onboarded) redirect(POST_ONBOARDING_PATH);
  const drops = await loadDrops();
  return (
    <PageShell viewer={viewer}>
      <div className="container onboarding">
        <OnboardingFlow initialUsername={viewer.username} drops={drops} />
      </div>
    </PageShell>
  );
}
