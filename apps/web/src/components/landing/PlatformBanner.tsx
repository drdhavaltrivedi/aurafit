import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function PlatformBanner({ onLaunch }: { onLaunch: () => void }) {
  return (
    <Card as="section" className="banner" aria-labelledby="platform-title">
      <h2 id="platform-title" className="section__title">
        Multi-platform ready: Next.js PWA &amp; Expo
      </h2>
      <p className="section__lede">
        Install straight from your browser as a Progressive Web App, or ship to iOS and Android with React Native.
      </p>
      <Button size="lg" onClick={onLaunch} leadingIcon={<Rocket />}>
        Launch the demo
      </Button>
    </Card>
  );
}
