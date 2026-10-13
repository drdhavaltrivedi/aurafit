import { ArrowDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Hero({ onEnterArena }: { onEnterArena: () => void }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <p className="pill pill--accent">
        <span aria-hidden="true">🚀</span> The next-gen fitness ecosystem for Gen Z &amp; Gen Alpha
      </p>
      <h1 id="hero-title" className="hero__title">
        Level up your physical stats.{' '}
        <span className="hero__title-accent">Lock in your Aura.</span>
      </h1>
      <p className="hero__lede">
        Turn daily movement into Solo Leveling quests. Gain Aura for every pushup, dodge stat atrophy, sync squad streaks,
        and crush 4-minute Phonk movement snacks.
      </p>
      <div className="hero__actions">
        <Button id="hero-enter-arena-btn" size="lg" onClick={onEnterArena} leadingIcon={<Zap />}>
          Enter the Arena
        </Button>
        <a className="btn btn--secondary btn--lg" href="#roles">
          Explore roles &amp; permissions
          <span className="btn__icon" aria-hidden="true">
            <ArrowDown />
          </span>
        </a>
      </div>
    </section>
  );
}
