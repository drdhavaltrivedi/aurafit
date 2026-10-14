import { Swords } from 'lucide-react';
import type { Squad } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { AppIcon } from '@/components/ui/AppIcon';
import { SampleDataBadge } from './SampleDataBadge';

/** Demo-mode squad card: seed data, always labelled "Sample data". Signed-in users get SquadPanel. */
export function SquadCard({ squad, sample = true }: { squad: Squad | undefined; sample?: boolean }) {
  if (!squad) {
    return (
      <Card as="section" aria-labelledby="squad-title">
        <CardHeader
          titleId="squad-title"
          eyebrow="Co-op squads"
          title="Squads"
          subtitle="Sign in to create a squad or join one with an invite code, then hit a weekly aura goal together."
        />
      </Card>
    );
  }
  return (
    <Card as="section" aria-labelledby="squad-title">
      {sample && <SampleDataBadge />}
      <CardHeader
        titleId="squad-title"
        level={2}
        eyebrow={
          <span className="text-pink">
            <Swords aria-hidden="true" className="icon-inline" /> Co-op squad battle
          </span>
        }
        title={
          <>
            <AppIcon name={squad.avatar} className="icon-inline text-pink" /> {squad.name}
          </>
        }
        subtitle={`${squad.memberCount}/${squad.maxMembers} active Hunters · ${squad.streakDays}-day synchronized streak`}
        action={<Badge tone="pink">#{squad.rankPosition} in region</Badge>}
      />
      <div className="panel">
        <div className="row-between text-xs">
          <span id="squad-goal-label" className="text-secondary">
            Weekly squad goal
          </span>
          <span className="text-pink fw-700">{squad.weeklyGoalProgress}% complete</span>
        </div>
        <ProgressBar value={squad.weeklyGoalProgress} labelledBy="squad-goal-label" tone="pink" />
      </div>
    </Card>
  );
}
