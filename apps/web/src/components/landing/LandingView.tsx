import type { UserRole } from '@aurafit/shared';
import { Hero } from './Hero';
import { AuraSimulator } from './AuraSimulator';
import { MarketGap } from './MarketGap';
import { RolesSection } from './RolesSection';
import { PlatformBanner } from './PlatformBanner';

interface LandingViewProps {
  onEnterArena: (role?: UserRole) => void;
}

export function LandingView({ onEnterArena }: LandingViewProps) {
  return (
    <div className="container landing">
      <Hero onEnterArena={() => onEnterArena()} />
      <AuraSimulator />
      <MarketGap />
      <RolesSection onTryRole={(role) => onEnterArena(role)} />
      <PlatformBanner onLaunch={() => onEnterArena()} />
    </div>
  );
}
