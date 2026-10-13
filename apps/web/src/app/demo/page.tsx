import type { Metadata } from 'next';
import { AuraFitApp } from '@/components/AuraFitApp';
import { ToastProvider } from '@/components/ui/Toast';
import { getViewer } from '@/lib/auth/viewer';

export const metadata: Metadata = { title: 'Demo arena' };
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
