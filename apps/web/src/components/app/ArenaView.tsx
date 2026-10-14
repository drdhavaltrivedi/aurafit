'use client';

import { useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { INITIAL_SQUADS, type HunterRank, type WorkoutDrop } from '@aurafit/shared';
import type { AuraFitState, ActionResult } from '@/hooks/useAuraFitState';
import { useToast } from '@/hooks/useToast';
import { sound } from '@/utils/audio';
import type { ValidDrop } from '@/lib/drops';
import { RoleBanner } from './RoleBanner';
import { HunterProfileCard } from './HunterProfileCard';
import { SquadCard } from './SquadCard';
import { QuestBoard } from './QuestBoard';
import { WorkoutDropList } from './WorkoutDropList';
import { CreatorStudio } from './CreatorStudio';
import { AdminConsole } from './AdminConsole';
import { WorkoutRunner } from './WorkoutRunner';
import { CreateDropModal } from './CreateDropModal';
import { ArenaSkeleton } from './ArenaSkeleton';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function ArenaView({ state }: { state: AuraFitState }) {
  const toast = useToast();
  const { activeRole, activeUser, can, hydrated } = state;
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Seed squads are demo-only; signed-in users see real squad data once squads ship.
  const squad = useMemo(
    () => (state.mode === 'demo' ? INITIAL_SQUADS.find((s) => s.id === activeUser.squadId) : undefined),
    [state.mode, activeUser.squadId],
  );

  const celebrate = useCallback(
    (rank: HunterRank) => {
      window.setTimeout(() => sound.playLevelUp(), 350);
      toast.show(`Rank ascended: welcome to ${rank}!`, 'success');
    },
    [toast],
  );

  const report = useCallback(
    (r: ActionResult): boolean => {
      if (!r.ok) {
        // 409: the server already has this completion — informative, not an error.
        toast.show(r.message, r.code === 'ALREADY_COMPLETED' ? 'warning' : 'error');
        return false;
      }
      toast.show(r.message, 'success');
      if (r.rankUp) celebrate(r.rankUp);
      return true;
    },
    [toast, celebrate],
  );

  const { completeQuest, finishWorkout, publishDrop } = state;

  const handleCompleteQuest = useCallback(
    async (id: string) => {
      if (report(await completeQuest(id))) sound.playQuestComplete();
    },
    [completeQuest, report],
  );

  const handleStart = useCallback(
    (drop: WorkoutDrop) => {
      if (!can('START_WORKOUT')) {
        toast.show('Your role cannot start workouts.', 'error');
        return;
      }
      sound.playClick();
      setActiveWorkout(drop);
    },
    [can, toast],
  );

  const handleFinish = useCallback(
    async (drop: WorkoutDrop) => {
      setActiveWorkout(null);
      if (report(await finishWorkout(drop))) sound.playLevelUp();
    },
    [finishWorkout, report],
  );

  const handlePublish = useCallback(
    async (input: ValidDrop) => {
      const ok = report(await publishDrop(input));
      if (ok) {
        sound.playLevelUp();
        setCreateOpen(false);
      }
      return ok;
    },
    [publishDrop, report],
  );

  const handleShare = useCallback(
    async (drop: WorkoutDrop) => {
      const url = `${window.location.origin}/`;
      const text = `Try "${drop.title}" on AuraFit`;
      try {
        if (navigator.share) {
          await navigator.share({ title: drop.title, text, url });
          return;
        }
        await navigator.clipboard.writeText(`${text}: ${url}`);
        toast.show('Share text and AuraFit link copied to clipboard.', 'success');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        toast.show('Could not share this drop. Copy the page URL instead.', 'error');
      }
    },
    [toast],
  );

  if (state.loadError) {
    return (
      <div className="container arena">
        <Card as="section" aria-labelledby="load-error-title">
          <CardHeader titleId="load-error-title" title="Couldn't load your arena" subtitle={state.loadError} />
          <Button leadingIcon={<RefreshCw />} onClick={state.reload}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (!hydrated) return <ArenaSkeleton />;

  // Signed in: every section the profile's role permits. Demo: one persona view at a time.
  const server = state.mode === 'server';
  const showMember = server || activeRole === 'MEMBER';
  const showCreator = server ? can('PUBLISH_WORKOUT_DROP') : activeRole === 'CREATOR';
  const showAdmin = server ? can('AUDIT_ANTI_CHEAT') : activeRole === 'ADMIN';

  return (
    <div className="container arena">
      <h1 className="sr-only">AuraFit Arena</h1>
      <RoleBanner user={activeUser} role={activeRole} demo={state.mode === 'demo'} />

      {showMember && (
        <div className="dashboard">
          <div className="dashboard__col">
            <HunterProfileCard user={activeUser} rankInfo={state.rankInfo} />
            <SquadCard squad={squad} />
          </div>
          <div className="dashboard__col">
            <QuestBoard quests={state.quests} canComplete={can('DO_QUESTS')} onComplete={handleCompleteQuest} />
            <WorkoutDropList drops={state.drops} canStart={can('START_WORKOUT')} onStart={handleStart} />
          </div>
        </div>
      )}

      {showCreator && (
        <CreatorStudio
          mode={state.mode}
          user={activeUser}
          drops={state.drops}
          canPublish={can('PUBLISH_WORKOUT_DROP')}
          canViewAnalytics={can('VIEW_CREATOR_ANALYTICS')}
          canStart={can('START_WORKOUT')}
          onCreate={() => setCreateOpen(true)}
          onShare={handleShare}
          onStart={handleStart}
        />
      )}

      {showAdmin && <AdminConsole mode={state.mode} canViewLeaderboard={can('VIEW_GYM_LEADERBOARD')} />}

      {activeWorkout && <WorkoutRunner key={activeWorkout.id} drop={activeWorkout} onClose={() => setActiveWorkout(null)} onFinish={handleFinish} />}

      {can('PUBLISH_WORKOUT_DROP') && <CreateDropModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handlePublish} />}
    </div>
  );
}
