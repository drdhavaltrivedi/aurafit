import { AuraFitApp } from '@/components/AuraFitApp';
import { ToastProvider } from '@/components/ui/Toast';
import { getViewer } from '@/lib/auth/viewer';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const viewer = await getViewer();
  return (
    <ToastProvider>
      <AuraFitApp page="landing" viewer={viewer} />
    </ToastProvider>
  );
}
