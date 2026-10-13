import type { Metadata } from 'next';
import { AuraFitApp } from '@/components/AuraFitApp';
import { ToastProvider } from '@/components/ui/Toast';
import { getViewer } from '@/lib/auth/viewer';

export const metadata: Metadata = {
  title: 'Try the demo: gamified workout quests',
  description: 'Try AuraFit without an account: complete sample workout quests, run the set timer and see how Aura points, streaks and RPG ranks work.',
  alternates: { canonical: '/demo' },
};
export const dynamic = 'force-dynamic';

/** Local-only demo (no account needed): progress lives in localStorage. */
export default async function DemoPage() {
  const viewer = await getViewer();
  return (
    <ToastProvider>
      <AuraFitApp page="demo" viewer={viewer} />
    </ToastProvider>
  );
}
