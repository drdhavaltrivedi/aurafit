import { memo } from 'react';
import { Check, Timer } from 'lucide-react';
import type { Quest } from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';

interface QuestBoardProps {
  quests: Quest[];
  canComplete: boolean;
  onComplete: (questId: string) => void;
}

export const QuestBoard = memo(function QuestBoard({ quests, canComplete, onComplete }: QuestBoardProps) {
  const done = quests.filter((q) => q.completed).length;
  return (
    <Card as="section" aria-labelledby="quests-title">
      <CardHeader
        titleId="quests-title"
        title={
          <>
            <span aria-hidden="true">📜</span> Daily Hunter quests
          </>
        }
        subtitle="Complete quests to farm Aura and prevent stat decay."
        action={
          <Badge tone="accent">
            {done} / {quests.length} done
          </Badge>
        }
      />
      <ul className="stack-3 list-reset">
        {quests.map((quest) => (
          <li key={quest.id} className={cx('quest', quest.completed && 'is-complete')}>
            <span className="quest__icon" aria-hidden="true">
              {quest.icon}
            </span>
            <div className="quest__body">
              <h3 className="quest__title">{quest.title}</h3>
              <p className="quest__subtitle">{quest.subtitle}</p>
              <div className="tag-row">
                <Badge tone="accent" size="sm">
                  +{quest.auraReward} AURA
                </Badge>
                <Badge tone="blue" size="sm">
                  +{quest.statReward.amount} {quest.statReward.stat.toUpperCase()}
                </Badge>
                <Badge tone="neutral" size="sm">
                  <Timer aria-hidden="true" className="icon-inline" /> {quest.durationMinutes} min
                </Badge>
              </div>
            </div>
            <div className="quest__action">
              {quest.completed ? (
                <span className="quest__done">
                  <Check aria-hidden="true" className="icon-inline" /> Claimed
                </span>
              ) : canComplete ? (
                <Button id={`claim-quest-${quest.id}`} size="sm" onClick={() => onComplete(quest.id)} aria-label={`Lock in: ${quest.title}`}>
                  Lock in
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
});
