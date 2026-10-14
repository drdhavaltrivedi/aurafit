import { Swords } from 'lucide-react';
import type { Squad } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { AppIcon } from '@/components/ui/AppIcon';

export function SquadCard({ squad }: { squad: Squad | undefined }) {
  if (!squad) {
    return (
      <Card as="section" aria-labelledby="squad-title">
        <CardHeader titleId="squad-title" eyebrow="Co-op squad battle" title="Squads are coming soon" subtitle="Team up with friends for weekly boss raids and shared streaks." />
      </Card>
    );
  }
  return (
    <Card as="section" aria-labelledby="squad-title">
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
            Weekly squad raid goal
          </span>
          <span className="text-pink fw-700">{squad.weeklyGoalProgress}% complete</span>
        </div>
        <ProgressBar value={squad.weeklyGoalProgress} labelledBy="squad-goal-label" tone="pink" />
      </div>
    </Card>
  );
}
