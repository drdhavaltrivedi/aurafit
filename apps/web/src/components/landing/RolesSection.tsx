import { ArrowRight, Check } from 'lucide-react';
import type { IconKey, UserRole } from '@aurafit/shared';
import { Card } from '@/components/ui/Card';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AppIcon } from '@/components/ui/AppIcon';

interface RoleCard {
  role: UserRole;
  tone: Tone;
  icon: IconKey;
  title: string;
  body: string;
  perks: string[];
  cta: string;
}

const CARDS: RoleCard[] = [
  {
    role: 'MEMBER',
    tone: 'accent',
    icon: 'zap',
    title: 'Athlete (Gen Z & Alpha)',
    body: 'The active player doing daily movement, levelling stats and competing with peers.',
    perks: ['Complete daily Hunter quests', 'Run interactive interval workouts', 'Join squads & co-op boss raids', 'Level up STR, AGI, END, REC', 'View global gym rankings'],
    cta: 'Try the Athlete dashboard',
  },
  {
    role: 'CREATOR',
    tone: 'pink',
    icon: 'crown',
    title: 'Fitness coach & creator',
    body: 'Publishes routine drops, curates phonk cadence and builds subscriber squads.',
    perks: ['All Athlete capabilities', 'Publish custom workout drops', 'Set Aura multipliers (1.0×–3.0×)', 'Creator Studio analytics & MRR', 'Manage subscriber squads'],
    cta: 'Try the Creator Studio',
  },
  {
    role: 'ADMIN',
    tone: 'emerald',
    icon: 'shield',
    title: 'Gym owner & platform overseer',
    body: 'Oversees gym competitions, audits anti-cheat streak proof and monitors the economy.',
    perks: ['Full administration rights', 'Manage the global gym leaderboard', 'Audit streak proof & anti-cheat flags', 'Balance Aura economy inflation', 'Grant roles (Member to Creator)'],
    cta: 'Try the Admin console',
  },
];

export function RolesSection({ onTryRole }: { onTryRole: (role: UserRole) => void }) {
  return (
    <section id="roles" className="section scroll-target" aria-labelledby="roles-title">
      <div className="section__head">
        <p className="eyebrow text-accent">Role-based access control</p>
        <h2 id="roles-title" className="section__title">
          Designed for every stakeholder
        </h2>
        <p className="section__lede">Each role has tailored capabilities and verified permissions.</p>
      </div>
      <ul className="grid grid--3 list-reset">
        {CARDS.map((c) => (
          <li key={c.role}>
            <Card interactive className="role-card">
              <div className="row-between">
                <Badge tone={c.tone} outline>
                  Role: {c.role}
                </Badge>
                <span className={`role-card__icon tone-${c.tone}`} aria-hidden="true">
                  <AppIcon name={c.icon} />
                </span>
              </div>
              <h3 className="role-card__title">{c.title}</h3>
              <p className="role-card__body">{c.body}</p>
              <div className="role-card__perks">
                <p className="overline">Key permissions</p>
                <ul className="check-list">
                  {c.perks.map((p) => (
                    <li key={p}>
                      <Check aria-hidden="true" className="check-list__icon" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <Button variant="secondary" block onClick={() => onTryRole(c.role)} trailingIcon={<ArrowRight />} className="role-card__cta">
                {c.cta}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
