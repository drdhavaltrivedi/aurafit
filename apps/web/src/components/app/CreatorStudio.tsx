'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Crown, ExternalLink, EyeOff, Pencil, Play, Plus, RefreshCw, Share2, Trash2 } from 'lucide-react';
import {
  ANALYTICS_RANGES,
  creatorProfilePath,
  hiddenByModeratorLabel,
  isSystemDropId,
  type AnalyticsRange,
  type CreatorDrop,
  type DropEditorInput,
  type WorkoutDrop,
} from '@aurafit/shared';
import type { AuraFitState } from '@/hooks/useAuraFitState';
import { useToast } from '@/hooks/useToast';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { CompletionsChart } from '@/components/creator/CompletionsChart';
import { DropEditor } from '@/components/creator/DropEditor';
import { useCreatorStudio } from '@/components/creator/useCreatorStudio';
import { formatCompact, formatNumber, plural } from '@/lib/format';
import { sound } from '@/utils/audio';
import { SampleDataBadge } from './SampleDataBadge';
import '@/components/creator/creator.css';

interface CreatorStudioProps {
  state: AuraFitState;
  canPublish: boolean;
  canViewAnalytics: boolean;
  canStart: boolean;
  onShare: (drop: WorkoutDrop) => void;
  onStart: (drop: WorkoutDrop) => void;
}

const RANGE_LABELS: Record<AnalyticsRange, string> = { '7d': '7 days', '30d': '30 days' };

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const utcDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Creator dashboard: KPI tiles and a completions chart from GET /api/v1/creator/analytics (demo: labelled
 * sample data), the creator's drops with status (Live / Scheduled / Hidden) and edit / delete, and the
 * full drop editor.
 */
export function CreatorStudio({ state, canPublish, canViewAnalytics, canStart, onShare, onStart }: CreatorStudioProps) {
  const toast = useToast();
  const studio = useCreatorStudio(state, canPublish || canViewAnalytics);
  const { mode, activeUser: user } = state;
  const [editor, setEditor] = useState<{ open: boolean; drop: CreatorDrop | null }>({ open: false, drop: null });
  const [confirm, setConfirm] = useState<CreatorDrop | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => new Map(studio.analytics?.drops.map((d) => [d.dropId, d]) ?? []), [studio.analytics]);
  const totals = studio.analytics?.totals;
  const rangeLabel = RANGE_LABELS[studio.range];

  const openEditor = useCallback((drop: CreatorDrop | null) => {
    sound.playClick();
    setEditor({ open: true, drop });
  }, []);
  const closeEditor = useCallback(() => setEditor((e) => ({ ...e, open: false })), []);

  const { save, remove } = studio;
  const handleSave = useCallback(
    async (input: DropEditorInput, existing: CreatorDrop | null) => {
      const res = await save(input, existing);
      if (res.ok && res.drop) {
        sound.playLevelUp();
        setEditor({ open: false, drop: null });
        const d = res.drop;
        toast.show(
          existing ? `"${d.title}" saved.` : d.status === 'SCHEDULED' ? `"${d.title}" is scheduled for ${shortDate(d.publishAt!)}.` : `"${d.title}" is live for all Hunters!`,
          'success',
        );
      }
      return res;
    },
    [save, toast],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    const res = await remove(confirm);
    setDeleting(false);
    setConfirm(null);
    toast.show(res.message, res.ok ? 'success' : 'error');
  }, [confirm, deleting, remove, toast]);

  return (
    <div className="stack-6 creator-studio">
      <Card as="section" variant="feature" aria-labelledby="studio-title">
        <div className="card-header">
          <div className="card-header__text">
            <Badge tone="pink" outline>
              <Crown aria-hidden="true" className="icon-inline" /> Creator Studio
            </Badge>
            <h2 id="studio-title" className="page-title">
              {user.username} <span className="text-secondary fw-600">{user.handle}</span>
            </h2>
            <p className="text-secondary text-sm">Build workout drops, schedule them and see how Hunters respond.</p>
          </div>
          <div className="btn-row">
            {mode === 'server' && user.handle ? (
              <Link href={creatorProfilePath(user.handle)} className="btn btn--secondary btn--md">
                <ExternalLink aria-hidden="true" className="btn__icon" /> Public page
              </Link>
            ) : null}
            {canPublish && (
              <Button id="create-drop-modal-btn" onClick={() => openEditor(null)} leadingIcon={<Plus />} aria-haspopup="dialog">
                New drop
              </Button>
            )}
          </div>
        </div>

        {canViewAnalytics && (
          <div className="stack-3">
            <div className="row-between creator-studio__toolbar">
              {mode === 'demo' ? <SampleDataBadge /> : <span className="text-xs text-muted">Last {rangeLabel} (UTC). Your own workouts are not counted.</span>}
              <div className="segmented" role="group" aria-label="Analytics range">
                {ANALYTICS_RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={studio.range === r ? 'segmented__item is-active' : 'segmented__item'}
                    aria-pressed={studio.range === r}
                    onClick={() => studio.setRange(r)}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            {studio.error ? (
              <div className="form-alert row-between" role="alert">
                <span>{studio.error}</span>
                <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} onClick={studio.reload}>
                  Retry
                </Button>
              </div>
            ) : null}
            <StatGrid label={mode === 'demo' ? 'Creator analytics (sample data)' : 'Creator analytics'}>
              <StatTile label="Followers" value={totals ? formatNumber(totals.followers) : '–'} hint="Hunters following you" />
              <StatTile
                label="Live drops"
                value={totals ? formatNumber(totals.liveDrops) : '–'}
                tone="blue"
                hint={totals && totals.scheduledDrops > 0 ? `${totals.scheduledDrops} scheduled` : 'Visible to all Hunters'}
                hintTone="blue"
              />
              <StatTile
                label="Completions"
                value={totals ? formatNumber(totals.completions) : '–'}
                tone="pink"
                hint={totals ? `${plural(totals.uniqueAthletes, 'athlete')} · ${rangeLabel}` : rangeLabel}
                hintTone="pink"
              />
              <StatTile
                label="Aura awarded"
                value={totals ? formatCompact(totals.auraAwarded) : '–'}
                tone="accent"
                hint={`Earned by athletes · ${rangeLabel}`}
                hintTone="accent"
              />
            </StatGrid>
          </div>
        )}
        <p className="text-xs text-muted">Paid squad passes are coming later. Publishing and following are free.</p>
      </Card>

      {canViewAnalytics && studio.analytics ? (
        <Card as="section" aria-labelledby="studio-chart-title">
          <h3 id="studio-chart-title" className="sr-only">
            Completions over time
          </h3>
          <CompletionsChart series={studio.analytics.series} title={`Daily completions · last ${rangeLabel}${mode === 'demo' ? ' (sample data)' : ''}`} />
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="published-title">
        <CardHeader titleId="published-title" title="Your drops" subtitle="Live and scheduled routines. Edits keep likes and completions." />
        {studio.loading && studio.drops.length === 0 ? (
          <p className="empty">Loading your drops…</p>
        ) : studio.drops.length === 0 ? (
          <div className="empty">
            <p>You haven&apos;t published any drops yet.</p>
            {canPublish && (
              <Button variant="secondary" onClick={() => openEditor(null)} leadingIcon={<Plus />}>
                Create your first drop
              </Button>
            )}
          </div>
        ) : (
          <ul className="stack-3 list-reset">
            {studio.drops.map((drop) => {
              const s = stats.get(drop.id);
              const hiddenReason = studio.hidden[drop.id];
              const editable = canPublish && !isSystemDropId(drop.id);
              return (
                <li key={drop.id} className="row-item studio-drop" data-status={hiddenReason ? 'HIDDEN' : drop.status}>
                  <span
                    className="studio-drop__cover"
                    style={{ background: `linear-gradient(135deg, ${drop.coverGradient[0]}, ${drop.coverGradient[1]})` }}
                    aria-hidden="true"
                  />
                  <div className="row-item__main">
                    <div className="row-item__title-row">
                      <h3 className="row-item__title">{drop.title}</h3>
                      {hiddenReason ? (
                        <Badge tone="orange" size="sm">
                          <EyeOff aria-hidden="true" className="icon-inline" /> Hidden
                        </Badge>
                      ) : drop.status === 'SCHEDULED' ? (
                        <Badge tone="blue" size="sm">
                          <CalendarClock aria-hidden="true" className="icon-inline" /> Scheduled
                        </Badge>
                      ) : (
                        <Badge tone="emerald" size="sm">
                          Live
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-secondary">
                      {drop.vibeTag} · {drop.durationMinutes} min · {plural(drop.exercises.length, 'move')} · {drop.auraMultiplier}× Aura
                    </p>
                    {hiddenReason ? <p className="text-xs text-orange">{hiddenByModeratorLabel(hiddenReason)}</p> : null}
                    {drop.status === 'SCHEDULED' && drop.publishAt ? (
                      <p className="text-xs text-blue">Goes live {shortDate(drop.publishAt)}</p>
                    ) : null}
                  </div>
                  <div className="row-item__side">
                    <dl className="studio-drop__stats">
                      <div>
                        <dt>{rangeLabel}</dt>
                        <dd>{plural(s?.completions ?? 0, 'finish', 'finishes')}</dd>
                      </div>
                      <div>
                        <dt>Athletes</dt>
                        <dd>{formatNumber(s?.uniqueAthletes ?? 0)}</dd>
                      </div>
                      <div>
                        <dt>Last done</dt>
                        <dd>{s?.lastCompletedOn ? utcDay(s.lastCompletedOn) : '—'}</dd>
                      </div>
                      <div>
                        <dt>All time</dt>
                        <dd>{formatCompact(drop.completionsCount)}</dd>
                      </div>
                    </dl>
                    <div className="btn-row">
                      {editable && (
                        <Button variant="secondary" size="sm" onClick={() => openEditor(drop)} leadingIcon={<Pencil />} aria-label={`Edit ${drop.title}`}>
                          Edit
                        </Button>
                      )}
                      {canStart && drop.status === 'LIVE' && !hiddenReason && (
                        <Button variant="secondary" size="sm" onClick={() => onStart(drop)} leadingIcon={<Play />} aria-label={`Preview ${drop.title}`}>
                          Preview
                        </Button>
                      )}
                      {drop.status === 'LIVE' && !hiddenReason && (
                        <Button variant="ghost" size="sm" onClick={() => onShare(drop)} leadingIcon={<Share2 />} aria-label={`Share ${drop.title}`}>
                          Share
                        </Button>
                      )}
                      {!isSystemDropId(drop.id) && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirm(drop)} leadingIcon={<Trash2 />} aria-label={`Delete ${drop.title}`}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canPublish && <DropEditor open={editor.open} drop={editor.drop} onClose={closeEditor} onSave={handleSave} />}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm ? `Delete "${confirm.title}"?` : 'Delete drop?'}
        description="The drop disappears for every Hunter. Athletes keep the aura they earned. This can't be undone."
      >
        <div className="form__actions">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Keep it
          </Button>
          <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete drop'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
