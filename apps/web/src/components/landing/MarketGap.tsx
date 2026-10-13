import { Check, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const LEGACY = [
  ['Spreadsheet fatigue', 'Weighing food in grams and filling static logs feels like homework.'],
  ['Delayed dopamine', 'Waiting 90 days for visible change makes most people quit in month one.'],
  ['Lonely workouts', 'No co-op accountability, no squad streak freezes, isolated tracking.'],
  ['Outdated media', '60-minute low-energy videos clash with short-form habits.'],
] as const;

const AURAFIT = [
  ['Anime-style RPG ranks', 'E-Rank to Shadow Monarch progression with STR / AGI / END / REC stats.'],
  ['Instant micro-rewards', 'Aura for every rep, with synthesized sound on completion.'],
  ['Squad lock-in', 'Co-op weekly titan boss raids with streak-shield protection.'],
  ['Movement snacks (3–5 min)', 'Phonk and anime-rhythm routines built for gaming or study breaks.'],
] as const;

export function MarketGap() {
  return (
    <section className="section" aria-labelledby="gap-title">
      <div className="section__head">
        <p className="eyebrow text-orange">Current market gap</p>
        <h2 id="gap-title" className="section__title">
          Why traditional fitness apps fail Gen Z &amp; Alpha
        </h2>
      </div>
      <div className="grid grid--2">
        <Card>
          <h3 className="list-card__title text-danger">
            <X aria-hidden="true" className="icon-inline" /> Legacy apps
          </h3>
          <ul className="feature-list">
            {LEGACY.map(([title, body]) => (
              <li key={title}>
                <strong>{title}:</strong> {body}
              </li>
            ))}
          </ul>
        </Card>
        <Card variant="highlight">
          <h3 className="list-card__title text-accent">
            <Check aria-hidden="true" className="icon-inline" /> The AuraFit solution
          </h3>
          <ul className="feature-list feature-list--strong">
            {AURAFIT.map(([title, body]) => (
              <li key={title}>
                <strong>{title}:</strong> {body}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
