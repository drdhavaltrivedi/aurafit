'use client';

import './squads.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Crown, KeyRound, LogOut, Pencil, Plus, RefreshCw, Share2, UserMinus, Users } from 'lucide-react';
import {
  squadInviteMessage,
  squadJoinUrl,
  type MySquad,
  type Squad,
  type SquadActivityItem,
  type SquadLeaderboardEntry,
} from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { AppIcon } from '@/components/ui/AppIcon';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SquadCard } from '@/components/app/SquadCard';
import { useToast } from '@/hooks/useToast';
import { formatNumber, plural } from '@/lib/format';
import type { ApiResult } from '@/lib/api-client';
import { squadsApi } from '@/lib/squads/client';
import { ConfirmModal, CreateSquadModal, EditSquadModal, JoinSquadModal, type SubmitErrors } from './SquadForms';
import { SquadLeaderboard } from './SquadLeaderboard';

/** Maps a failed API result to form errors (taken name/tag and bad codes go next to their field). */
export function toSubmitErrors(r: Extract<ApiResult<unknown>, { ok: false }>): NonNullable<SubmitErrors> {
  switch (r.code as string) {
    case 'SQUAD_NAME_TAKEN':
      return { name: r.message };
    case 'SQUAD_TAG_TAKEN':
      return { tag: r.message };
    case 'INVALID_INVITE_CODE':
      return { code: r.message };
    default:
      return { form: r.message };
  }
}

const timeFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

interface SquadPanelProps {
  mode: 'demo' | 'server';
  /** Demo only: the persona's sample squad. */
  demoSquad?: Squad;
  /** Changes when the user's aura changes, so weekly progress refreshes after a completion. */
  refreshKey?: number;
}

export function SquadPanel({ mode, demoSquad, refreshKey }: SquadPanelProps) {
  if (mode === 'demo') return <SquadCard squad={demoSquad} sample />;
  return <LiveSquadPanel refreshKey={refreshKey} />;
}

type Dialog = null | 'create' | 'join' | 'edit' | 'leave' | 'regenerate' | { remove: { profileId: string; handle: string } };

function LiveSquadPanel({ refreshKey }: { refreshKey?: number }) {
  const toast = useToast();
  const [squad, setSquad] = useState<MySquad | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [board, setBoard] = useState<SquadLeaderboardEntry[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [feed, setFeed] = useState<SquadActivityItem[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [origin, setOrigin] = useState('');
  const seq = useRef(0);

  useEffect(() => setOrigin(window.location.origin), []);

  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    const r = await squadsApi.leaderboard();
    setBoardLoading(false);
    if (r.ok) {
      setBoard(r.data.squads);
      setBoardError(null);
    } else setBoardError(r.message);
  }, []);

  const loadFeed = useCallback(async () => {
    const r = await squadsApi.activity();
    setFeed(r.ok ? r.data.items : null);
  }, []);

  const load = useCallback(async () => {
    const id = ++seq.current;
    const r = await squadsApi.me();
    if (id !== seq.current) return;
    if (r.ok) {
      setSquad(r.data.squad);
      setLoadError(null);
      if (r.data.squad) void loadFeed();
      else setFeed(null);
    } else setLoadError(r.message);
  }, [loadFeed]);

  useEffect(() => {
    void load();
    void loadBoard();
  }, [load, loadBoard, refreshKey]);

  /** After a mutation that returns the new squad state. */
  const applied = (next: MySquad | null) => {
    setSquad(next);
    setDialog(null);
    if (next) void loadFeed();
    else setFeed(null);
    void loadBoard();
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${what} copied.`, 'success');
    } catch {
      toast.show(`Couldn't copy. Select the ${what.toLowerCase()} and copy it manually.`, 'error');
    }
  };

  const share = async (s: MySquad) => {
    if (!s.inviteCode) return;
    const url = squadJoinUrl(origin, s.inviteCode);
    const text = squadInviteMessage(s, s.inviteCode, url);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${s.name} on AuraFit`, text, url });
        return;
      }
      await copy(text, 'Invite');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await copy(url, 'Invite link');
    }
  };

  if (loadError && squad === undefined) {
    return (
      <Card as="section" aria-labelledby="squad-title">
        <CardHeader titleId="squad-title" title="Squad" subtitle={loadError} />
        <div>
          <Button variant="secondary" leadingIcon={<RefreshCw />} onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  const removeTarget = dialog && typeof dialog === 'object' ? dialog.remove : null;

  return (
    <>
      {squad === undefined ? (
        <Card as="section" aria-labelledby="squad-title" aria-busy="true">
          <CardHeader titleId="squad-title" title="Squad" subtitle="Loading your squad…" />
        </Card>
      ) : squad === null ? (
        <Card as="section" aria-labelledby="squad-title" id="squad-panel">
          <CardHeader
            titleId="squad-title"
            eyebrow={
              <span className="text-pink">
                <Users aria-hidden="true" className="icon-inline" /> Squads
              </span>
            }
            title="Train as a squad"
            subtitle="Team up with up to 4 friends, hit a weekly aura goal together and climb the squad leaderboard."
          />
          <div className="squad-actions">
            <Button leadingIcon={<Plus />} onClick={() => setDialog('create')} id="squad-create">
              Create squad
            </Button>
            <Button variant="secondary" leadingIcon={<KeyRound />} onClick={() => setDialog('join')} id="squad-join">
              Join with code
            </Button>
          </div>
        </Card>
      ) : (
        <Card as="section" aria-labelledby="squad-title" id="squad-panel">
          <div className="row-between">
            <div className="squad-head">
              <span className="squad-emblem" aria-hidden="true">
                <AppIcon name={squad.icon} />
              </span>
              <div className="squad-head__text">
                <p className="eyebrow text-pink">Your squad{squad.rank ? ` · #${squad.rank} this week` : ''}</p>
                <h2 id="squad-title" className="squad-head__name">
                  {squad.name} <span className="squad-tag">[{squad.tag}]</span>
                </h2>
                <p className="squad-head__meta">
                  {squad.memberCount}/{squad.maxMembers} hunters
                </p>
              </div>
            </div>
            {squad.isLeader && (
              <Badge tone="orange">
                <Crown aria-hidden="true" className="icon-inline" /> Leader
              </Badge>
            )}
          </div>

          <div className="panel">
            <div className="row-between text-xs">
              <span id="squad-goal-label" className="text-secondary">
                Weekly goal{squad.progress.goalIsCustom ? '' : ' (automatic)'}
              </span>
              <span className="text-pink fw-700">{squad.progress.percent}%</span>
            </div>
            <ProgressBar
              value={squad.progress.percent}
              labelledBy="squad-goal-label"
              valueText={`${formatNumber(squad.progress.aura)} of ${formatNumber(squad.progress.goal)} aura, ${squad.progress.percent}%`}
              tone="pink"
            />
            <div className="row-between text-xs">
              <span className="fw-700">
                {formatNumber(squad.progress.aura)} / {formatNumber(squad.progress.goal)} aura
              </span>
              <span className="text-secondary">{plural(squad.progress.daysLeft, 'day')} left</span>
            </div>
          </div>

          <section aria-labelledby="squad-members-title" className="stack-2">
            <h3 id="squad-members-title" className="overline" style={{ marginBottom: 0 }}>
              Members · this week
            </h3>
            <ul className="list-reset squad-members">
              {squad.members.map((m) => (
                <li key={m.profileId} className="squad-member">
                  <Avatar src={m.avatarUrl} alt="" name={m.username} size={36} />
                  <div className="squad-member__main">
                    <span className="squad-member__name">
                      {m.username}
                      {m.role === 'LEADER' && (
                        <Badge tone="orange" size="sm">
                          <Crown aria-hidden="true" className="icon-inline" /> Leader
                        </Badge>
                      )}
                      {m.isYou && (
                        <Badge tone="accent" size="sm">
                          You
                        </Badge>
                      )}
                    </span>
                    <span className="squad-member__sub">
                      {m.handle} · {m.rank}
                    </span>
                  </div>
                  <span className="squad-member__aura">{formatNumber(m.weeklyAura)}</span>
                  {squad.isLeader && !m.isYou && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      aria-label={`Remove ${m.handle} from the squad`}
                      onClick={() => setDialog({ remove: { profileId: m.profileId, handle: m.handle } })}
                    >
                      <UserMinus aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {squad.isLeader && squad.inviteCode ? (
            <section aria-labelledby="squad-invite-title" className="panel squad-invite">
              <h3 id="squad-invite-title" className="text-sm fw-700">
                Invite hunters
              </h3>
              <div className="squad-invite__row">
                <code className="squad-invite__code" aria-label={`Invite code ${squad.inviteCode.split('').join(' ')}`} id="squad-invite-code">
                  {squad.inviteCode}
                </code>
                <Button variant="secondary" size="sm" leadingIcon={<Copy />} onClick={() => void copy(squad.inviteCode!, 'Invite code')}>
                  Copy code
                </Button>
              </div>
              <div className="squad-invite__row">
                <span className="squad-invite__link">{origin ? squadJoinUrl(origin, squad.inviteCode) : ''}</span>
                <Button variant="secondary" size="sm" leadingIcon={<Copy />} onClick={() => void copy(squadJoinUrl(origin, squad.inviteCode!), 'Invite link')}>
                  Copy link
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<Share2 />} onClick={() => void share(squad)}>
                  Share
                </Button>
              </div>
              {squad.memberCount >= squad.maxMembers && <p className="field__hint">Your squad is full. Nobody can join until someone leaves.</p>}
            </section>
          ) : (
            <p className="text-xs text-secondary">Want to invite someone? Ask your squad leader for the invite link.</p>
          )}

          <div className="squad-actions">
            {squad.isLeader && (
              <>
                <Button variant="secondary" size="sm" leadingIcon={<Pencil />} onClick={() => setDialog('edit')}>
                  Edit squad
                </Button>
                <Button variant="secondary" size="sm" leadingIcon={<RefreshCw />} onClick={() => setDialog('regenerate')}>
                  New invite code
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" leadingIcon={<LogOut />} onClick={() => setDialog('leave')} id="squad-leave">
              Leave squad
            </Button>
          </div>

          <section aria-labelledby="squad-feed-title" className="stack-2">
            <h3 id="squad-feed-title" className="overline" style={{ marginBottom: 0 }}>
              Squad activity
            </h3>
            {feed === null ? (
              <p className="text-xs text-secondary">Loading activity…</p>
            ) : feed.length === 0 ? (
              <p className="text-xs text-secondary">No completions yet this week. Be the first.</p>
            ) : (
              <ul className="list-reset squad-feed">
                {feed.map((i) => (
                  <li key={i.id} className="squad-feed__item">
                    <div className="squad-feed__main">
                      <span className="squad-feed__title">
                        <strong>{i.isYou ? 'You' : i.handle}</strong> finished {i.kind === 'QUEST' ? 'quest' : 'workout'} <strong>{i.title}</strong>
                      </span>
                      <span className="squad-feed__sub">
                        <time dateTime={i.completedAt}>{timeFmt.format(new Date(i.completedAt))}</time>
                      </span>
                    </div>
                    <span className="squad-member__aura">+{formatNumber(i.aura)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Card>
      )}

      <SquadLeaderboard squads={board} loading={boardLoading} error={boardError} mySquadId={squad?.id} onRetry={() => void loadBoard()} />

      <CreateSquadModal
        open={dialog === 'create'}
        onClose={() => setDialog(null)}
        onSubmit={async (v) => {
          const r = await squadsApi.create(v);
          if (!r.ok) return toSubmitErrors(r);
          toast.show(`Squad ${r.data.squad?.name ?? ''} created. Share your invite code!`, 'success');
          applied(r.data.squad);
          return null;
        }}
      />
      <JoinSquadModal
        open={dialog === 'join'}
        onClose={() => setDialog(null)}
        onSubmit={async (code) => {
          const r = await squadsApi.join(code);
          if (!r.ok) return toSubmitErrors(r);
          toast.show(`Welcome to ${r.data.squad?.name ?? 'the squad'}!`, 'success');
          applied(r.data.squad);
          return null;
        }}
      />
      {squad && (
        <EditSquadModal
          open={dialog === 'edit'}
          squad={squad}
          onClose={() => setDialog(null)}
          onSubmit={async (patch) => {
            const r = await squadsApi.update(patch);
            if (!r.ok) return toSubmitErrors(r);
            toast.show('Squad updated.', 'success');
            applied(r.data.squad);
            return null;
          }}
        />
      )}
      <ConfirmModal
        open={dialog === 'leave'}
        title="Leave squad?"
        danger
        confirmLabel="Leave squad"
        body={
          squad && squad.memberCount <= 1
            ? 'You are the last member, so the squad will be deleted.'
            : squad?.isLeader
              ? 'Leadership passes to the longest-standing member. Your aura this week leaves with you.'
              : 'Your aura this week stops counting for this squad. You can rejoin with an invite code.'
        }
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const r = await squadsApi.leave();
          if (!r.ok) {
            toast.show(r.message, 'error');
            return;
          }
          toast.show(r.data.squadDeleted ? 'You left. The squad was deleted.' : 'You left the squad.', 'success');
          applied(null);
        }}
      />
      <ConfirmModal
        open={dialog === 'regenerate'}
        title="Make a new invite code?"
        confirmLabel="New code"
        body="The current code and link stop working immediately."
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const r = await squadsApi.regenerateInviteCode();
          if (!r.ok) {
            toast.show(r.message, 'error');
            return;
          }
          toast.show('New invite code ready.', 'success');
          setSquad((s) => (s ? { ...s, inviteCode: r.data.inviteCode } : s));
          setDialog(null);
        }}
      />
      <ConfirmModal
        open={!!removeTarget}
        title="Remove member?"
        danger
        confirmLabel="Remove"
        body={removeTarget ? `${removeTarget.handle} will leave the squad. They can rejoin with an invite code.` : ''}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          const r = await squadsApi.removeMember(removeTarget.profileId);
          if (!r.ok) {
            toast.show(r.message, 'error');
            return;
          }
          toast.show(`${removeTarget.handle} was removed.`, 'success');
          applied(r.data.squad);
        }}
      />
    </>
  );
}
