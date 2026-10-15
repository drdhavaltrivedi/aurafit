'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { INITIAL_SQUADS, creatorProfilePath, rankLabel, type HunterRank, type WorkoutDrop } from '@aurafit/shared';
import type { AuraFitState, ActionResult } from '@/hooks/useAuraFitState';
import { useToast } from '@/hooks/useToast';
import { sound } from '@/utils/audio';
import { RoleBanner } from './RoleBanner';
import { HunterProfileCard, type ProfileShare } from './HunterProfileCard';
import { useShareCard } from '@/components/share/useShareCard';
import { SquadPanel } from '@/components/squads/SquadPanel';
import { QuestBoard } from './QuestBoard';
import { WorkoutDropList } from './WorkoutDropList';
import { CreatorStudio } from './CreatorStudio';
import { AdminConsole } from './AdminConsole';
import { WorkoutRunner } from './WorkoutRunner';
import { ArenaSkeleton } from './ArenaSkeleton';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function ArenaView({ state }: { state: AuraFitState }) {
  const toast = useToast();
  const { activeRole, activeUser, can, hydrated } = state;
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);

  // Seed squads are demo-only (labelled sample data); signed-in users get the live SquadPanel.
  const squad = useMemo(
    () => (state.mode === 'demo' ? INITIAL_SQUADS.find((s) => s.id === activeUser.squadId) : undefined),
    [state.mode, activeUser.squadId],
  );

  // Shareable rank card (signed-in only: demo profiles are not public, so they have no card).
  const shareCard = useShareCard(activeUser);
  const canShare = state.mode === 'server' && shareCard.available;
  const shareRef = useRef(shareCard.share);
  shareRef.current = shareCard.share;
  const profileShare: ProfileShare | undefined = canShare
    ? { onShare: () => void shareRef.current('profile') }
    : state.mode === 'demo'
      ? { disabledReason: "Demo profiles aren't public, so they can't be shared. Create a free account to get your own hunter card." }
      : undefined;

  const celebrate = useCallback(
    (rank: HunterRank) => {
      window.setTimeout(() => sound.playLevelUp(), 350);
      if (canShare) {
        toast.show(`You ranked up to ${rankLabel(rank)}!`, 'success', {
          action: { label: 'Share your card', onClick: () => void shareRef.current('rankUp', rank) },
        });
      } else {
        toast.show(`Rank ascended: welcome to ${rank}!`, 'success');
      }
    },
    [toast, canShare],
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

  const { completeQuest, finishWorkout } = state;

  // /arena?start=<dropId> (e.g. "Start now" after onboarding) opens that drop's runner once.
  const startHandled = useRef(false);
  useEffect(() => {
    if (!hydrated || startHandled.current) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('start');
    if (!id) return;
    startHandled.current = true;
    url.searchParams.delete('start');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    const drop = state.drops.find((d) => d.id === id);
    if (drop && can('START_WORKOUT')) setActiveWorkout(drop);
    else if (!drop) toast.show("That workout isn't available right now. Pick another one below.", 'warning');
  }, [hydrated, state.drops, can, toast]);

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

  const handleShare = useCallback(
    async (drop: WorkoutDrop) => {
      // Signed in: link the creator's public page (it lists their live drops); demo: the home page.
      const url = state.mode === 'server' && drop.creatorHandle ? `${window.location.origin}${creatorProfilePath(drop.creatorHandle)}` : `${window.location.origin}/`;
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
    [toast, state.mode],
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
            <HunterProfileCard user={activeUser} rankInfo={state.rankInfo} share={profileShare} />
            <SquadPanel mode={state.mode} demoSquad={squad} refreshKey={activeUser.auraPoints} />
          </div>
          <div className="dashboard__col">
            <QuestBoard quests={state.quests} canComplete={can('DO_QUESTS')} onComplete={handleCompleteQuest} />
            <WorkoutDropList drops={state.drops} canStart={can('START_WORKOUT')} onStart={handleStart} mode={state.mode} viewerId={server ? activeUser.id : undefined} />
          </div>
        </div>
      )}

      {showCreator && (
        <CreatorStudio
          state={state}
          canPublish={can('PUBLISH_WORKOUT_DROP')}
          canViewAnalytics={can('VIEW_CREATOR_ANALYTICS')}
          canStart={can('START_WORKOUT')}
          onShare={handleShare}
          onStart={handleStart}
        />
      )}

      {showAdmin && <AdminConsole mode={state.mode} canViewLeaderboard={can('VIEW_GYM_LEADERBOARD')} />}

      {activeWorkout && <WorkoutRunner key={activeWorkout.id} drop={activeWorkout} onClose={() => setActiveWorkout(null)} onFinish={handleFinish} />}

      {canShare && shareCard.dialog}
    </div>
  );
}
