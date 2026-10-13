import { memo } from 'react';
import { Flame, Heart, Play, Timer } from 'lucide-react';
import type { WorkoutDrop } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { formatCompact } from '@/lib/format';

interface WorkoutDropListProps {
  drops: WorkoutDrop[];
  canStart: boolean;
  onStart: (drop: WorkoutDrop) => void;
}

export const WorkoutDropList = memo(function WorkoutDropList({ drops, canStart, onStart }: WorkoutDropListProps) {
  return (
    <Card as="section" aria-labelledby="drops-title">
      <CardHeader
        titleId="drops-title"
        title={
          <>
            <Flame aria-hidden="true" className="icon-inline text-orange" /> Trending workout drops
          </>
        }
        subtitle="Curated routines from top athletes."
      />
      {drops.length === 0 ? (
        <p className="empty">No drops yet. Check back soon.</p>
      ) : (
        <ul className="stack-3 list-reset">
          {drops.map((drop) => (
            <li key={drop.id} className="drop">
              <div className="drop__main">
                <div className="tag-row">
                  <Badge tone="pink" size="sm">
                    {drop.vibeTag}
                  </Badge>
                  <Badge tone="accent" size="sm">
                    {drop.auraMultiplier}× Aura boost
                  </Badge>
                </div>
                <h3 className="drop__title">{drop.title}</h3>
                <p className="drop__tagline">{drop.tagline}</p>
              </div>
              {canStart && (
                <Button
                  id={`start-workout-${drop.id}`}
                  className="drop__cta"
                  size="sm"
                  onClick={() => onStart(drop)}
                  leadingIcon={<Play />}
                  aria-label={`Start session: ${drop.title}`}
                >
                  Start
                </Button>
              )}
              <div className="drop__meta">
                <span className="drop__creator">
                  <Avatar src={drop.creatorAvatar} alt="" size={24} name={drop.creatorName} />
                  {drop.creatorName}
                </span>
                <span className="drop__facts">
                  <span>
                    <Timer aria-hidden="true" className="icon-inline" /> {drop.durationMinutes} min
                  </span>
                  <span>
                    <Flame aria-hidden="true" className="icon-inline" /> {drop.caloriesBurnEstimate} kcal
                  </span>
                  <span>
                    <Heart aria-hidden="true" className="icon-inline" /> {formatCompact(drop.likesCount)}
                    <span className="sr-only"> likes</span>
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
});
