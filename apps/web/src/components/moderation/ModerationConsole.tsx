'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { EyeOff, Flag, RotateCcw, Search, ShieldAlert, Undo2, UserX } from 'lucide-react';
import {
  ADMIN_ROLE_OPTIONS,
  AUDIT_ACTION_LABELS,
  AURA_FLAG_LABELS,
  MODERATION_NOTE_MAX_LENGTH,
  REPORT_REASON_LABELS,
  type AdminRecentLog,
  type AdminUserListItem,
  type AdminUserSummary,
  type AuditEntry,
  type FlaggedUser,
  type ModerationQueueItem,
  type ReportReason,
  type UserRole,
} from '@aurafit/shared';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';
import { formatNumber } from '@/lib/format';
import { moderationApi, type ModerationResult } from '@/lib/moderation/client';

type Tab = 'reports' | 'flags' | 'users' | 'audit';
const TABS: { id: Tab; label: string }[] = [
  { id: 'reports', label: 'Reports' },
  { id: 'flags', label: 'Aura flags' },
  { id: 'users', label: 'Users' },
  { id: 'audit', label: 'Audit log' },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Asks for a reason / note before a moderation action. `required` blocks an empty submit. */
type Ask = { title: string; label: string; confirm: string; required: boolean; run: (text: string) => Promise<boolean> };

function ReasonDialog({ ask, onClose }: { ask: Ask | null; onClose: () => void }) {
  const uid = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(''), [ask]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ask || busy || (ask.required && !text.trim())) return;
    setBusy(true);
    const done = await ask.run(text.trim());
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Modal open={!!ask} onClose={onClose} size="sm" title={ask?.title ?? ''} initialFocusRef={ref}>
      <form onSubmit={submit} noValidate className="form stack-3">
        <div className="field">
          <label htmlFor={`${uid}-text`} className="field__label">
            {ask?.label}
          </label>
          <textarea
            ref={ref}
            id={`${uid}-text`}
            className="input"
            rows={3}
            maxLength={MODERATION_NOTE_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="btn-row btn-row--end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy || (ask?.required && !text.trim())}>
            {busy ? 'Working…' : ask?.confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Real admin moderation (server mode): report queue, aura flags, user management and the audit log. */
export function ModerationConsole() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('reports');
  const [ask, setAsk] = useState<Ask | null>(null);

  /** Runs an action, toasts the outcome; true on success. */
  const act = useCallback(
    async <T,>(p: Promise<ModerationResult<T>>, success: string, after?: () => void): Promise<boolean> => {
      const r = await p;
      if (!r.ok) {
        toast.show(r.message, 'error');
        return false;
      }
      toast.show(success, 'success');
      after?.();
      return true;
    },
    [toast],
  );

  return (
    <Card as="section" aria-labelledby="moderation-title">
      <CardHeader
        titleId="moderation-title"
        title={
          <>
            <ShieldAlert aria-hidden="true" className="icon-inline text-orange" /> Moderation
          </>
        }
        subtitle="Every action is recorded in the audit log."
        action={
          <div className="segmented mod-tabs" role="group" aria-label="Moderation section">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tab === t.id ? 'segmented__item is-active' : 'segmented__item'}
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      {tab === 'reports' && <ReportsTab act={act} setAsk={setAsk} />}
      {tab === 'flags' && <FlagsTab act={act} setAsk={setAsk} />}
      {tab === 'users' && <UsersTab act={act} setAsk={setAsk} />}
      {tab === 'audit' && <AuditTab />}
      <ReasonDialog ask={ask} onClose={() => setAsk(null)} />
    </Card>
  );
}

type Act = <T>(p: Promise<ModerationResult<T>>, success: string, after?: () => void) => Promise<boolean>;
type TabProps = { act: Act; setAsk: (a: Ask) => void };

/** Loads `load()` on mount and on `reload()`. */
function useLoad<T>(load: () => Promise<ModerationResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const r = await load();
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.message);
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

function Status({ error, loading, empty, emptyText }: { error: string | null; loading: boolean; empty: boolean; emptyText: string }) {
  if (error) return <p role="alert" className="form-alert">{error}</p>;
  if (loading) return <p className="empty">Loading…</p>;
  if (empty) return <p className="empty">{emptyText}</p>;
  return null;
}

function ReportsTab({ act, setAsk }: TabProps) {
  const { data, error, reload } = useLoad(moderationApi.queue);
  const items = data?.items ?? [];
  const dismiss = (i: ModerationQueueItem) =>
    setAsk({
      title: 'Dismiss reports',
      label: 'Note (optional)',
      confirm: 'Dismiss',
      required: false,
      run: (note) => act(moderationApi.dismiss(i.targetType, i.targetId, note || undefined), 'Reports dismissed.', reload),
    });
  const hide = (dropId: string) =>
    setAsk({
      title: 'Hide workout',
      label: 'Reason (the creator sees this)',
      confirm: 'Hide workout',
      required: true,
      run: (reason) => act(moderationApi.hideDrop(dropId, reason), 'Workout hidden.', reload),
    });

  return (
    <div className="stack-3">
      <Status error={error} loading={!data && !error} empty={!!data && items.length === 0} emptyText="No open reports. All clear." />
      <ul className="stack-3 list-reset">
        {items.map((i) => {
          const name = i.drop ? i.drop.title : i.squad ? `${i.squad.name} [${i.squad.tag}]` : 'Deleted item';
          return (
            <li key={`${i.targetType}:${i.targetId}`} className="row-item">
              <div className="row-item__main">
                <div className="row-item__title-row">
                  <Badge tone={i.targetType === 'DROP' ? 'pink' : 'blue'} size="sm">
                    {i.targetType === 'DROP' ? 'Workout' : 'Squad'}
                  </Badge>
                  <h3 className="row-item__title">{name}</h3>
                  {i.drop?.moderationStatus === 'HIDDEN' && (
                    <Badge tone="orange" size="sm" outline>
                      Hidden
                    </Badge>
                  )}
                </div>
                {i.drop && <p className="text-xs text-secondary">by {i.drop.creatorHandle}</p>}
                <p className="text-sm">
                  <Flag aria-hidden="true" className="icon-inline text-danger" /> {i.openCount} open:{' '}
                  {Object.entries(i.reasonCounts)
                    .map(([r, n]) => `${REPORT_REASON_LABELS[r as ReportReason]} ×${n}`)
                    .join(', ')}
                </p>
                {i.latest
                  .filter((l) => l.note)
                  .slice(0, 3)
                  .map((l) => (
                    <p key={l.createdAt} className="text-xs text-secondary">
                      “{l.note}” · {when(l.createdAt)}
                    </p>
                  ))}
              </div>
              <div className="row-item__side btn-row">
                {i.drop && i.drop.moderationStatus !== 'HIDDEN' && (
                  <Button size="sm" variant="danger" leadingIcon={<EyeOff />} onClick={() => hide(i.drop!.id)}>
                    Hide
                  </Button>
                )}
                {i.drop?.moderationStatus === 'HIDDEN' && (
                  <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={() => void act(moderationApi.restoreDrop(i.drop!.id), 'Workout restored.', reload)}>
                    Restore
                  </Button>
                )}
                {i.squad && (
                  <Button size="sm" variant="danger" onClick={() => void act(moderationApi.resetSquadName(i.squad!.id), 'Squad name reset.', reload)}>
                    Reset name
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => dismiss(i)}>
                  Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FlagsTab({ act, setAsk }: TabProps) {
  const { data, error, reload } = useLoad(moderationApi.flags);
  const items = data?.items ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const clear = (u: FlaggedUser) =>
    setAsk({
      title: `Clear flags for ${u.handle}`,
      label: 'Note (optional)',
      confirm: 'Mark reviewed',
      required: false,
      run: (note) => act(moderationApi.clearFlag(u.profileId, note || undefined), 'Flags cleared.', reload),
    });

  return (
    <div className="stack-3">
      <Status error={error} loading={!data && !error} empty={!!data && items.length === 0} emptyText="No suspicious aura activity right now." />
      <ul className="stack-3 list-reset">
        {items.map((u) => (
          <li key={u.profileId} className="row-item">
            <div className="row-item__main">
              <div className="row-item__title-row">
                <h3 className="row-item__title">{u.handle}</h3>
                {u.flags.map((f) => (
                  <Badge key={f} tone="orange" size="sm">
                    {AURA_FLAG_LABELS[f]}
                  </Badge>
                ))}
                {u.suspended && (
                  <Badge tone="neutral" size="sm" outline>
                    Suspended
                  </Badge>
                )}
              </div>
              <ul className="text-xs text-secondary list-reset">
                {u.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <button type="button" className="link-button text-sm" aria-expanded={open === u.profileId} onClick={() => setOpen(open === u.profileId ? null : u.profileId)}>
                {open === u.profileId ? 'Hide evidence' : `Show evidence (${u.evidence.length})`}
              </button>
              {open === u.profileId && (
                <LogList
                  logs={u.evidence.map((e) => ({ ...e, id: e.logId, dateKey: '' }))}
                  tooFast={new Set(u.evidence.filter((e) => e.tooFast).map((e) => e.logId))}
                  onRevert={(l) => revertAsk(act, setAsk, u.profileId, l, reload)}
                />
              )}
            </div>
            <div className="row-item__side btn-row">
              <Button size="sm" variant="ghost" onClick={() => clear(u)}>
                Mark reviewed
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function revertAsk(act: Act, setAsk: (a: Ask) => void, profileId: string, log: AdminRecentLog, after: () => void) {
  setAsk({
    title: `Revert “${log.title}”`,
    label: `Removes ${log.auraEarned} aura from this user. Note (optional)`,
    confirm: 'Revert aura',
    required: false,
    run: (note) => act(moderationApi.revert(profileId, log.kind, log.id, note || undefined), `Removed ${log.auraEarned} aura.`, after),
  });
}

function LogList({ logs, onRevert, tooFast }: { logs: AdminRecentLog[]; onRevert: (l: AdminRecentLog) => void; tooFast?: Set<string> }) {
  if (logs.length === 0) return <p className="text-xs text-secondary">No recent completions.</p>;
  return (
    <ul className="stack-2 list-reset">
      {logs.map((l) => (
        <li key={l.id} className="mod-log">
          <span>
            <span className="fw-700">{l.title}</span>{' '}
            <span className="text-xs text-secondary">
              {l.kind === 'QUEST' ? 'Quest' : 'Workout'} · +{l.auraEarned} aura · {when(l.completedAt)}
            </span>
            {tooFast?.has(l.id) && (
              <Badge tone="orange" size="sm" className="mod-log__flag">
                Too fast
              </Badge>
            )}
          </span>
          <Button size="sm" variant="ghost" leadingIcon={<Undo2 />} onClick={() => onRevert(l)}>
            Revert
          </Button>
        </li>
      ))}
    </ul>
  );
}

function UsersTab({ act, setAsk }: TabProps) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [items, setItems] = useState<AdminUserListItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (q: string, after: string | null) => {
    const r = await moderationApi.users(q, after);
    if (!r.ok) return setError(r.message);
    setError(null);
    setItems((prev) => (after && prev ? [...prev, ...r.data.items] : r.data.items));
    setNext(r.data.nextAfter);
  }, []);
  useEffect(() => {
    void load(submitted, null);
  }, [load, submitted]);

  if (selected) return <UserDetail id={selected} act={act} setAsk={setAsk} onBack={() => setSelected(null)} />;

  return (
    <div className="stack-3">
      <form
        className="mod-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <label htmlFor={`${uid}-q`} className="sr-only">
          Search users by handle or name
        </label>
        <input id={`${uid}-q`} className="input" type="search" placeholder="Search @handle or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="secondary" leadingIcon={<Search />}>
          Search
        </Button>
      </form>
      <Status error={error} loading={!items && !error} empty={!!items && items.length === 0} emptyText="No users match." />
      <ul className="stack-2 list-reset">
        {(items ?? []).map((u) => (
          <li key={u.id}>
            <button type="button" className="row-item mod-user" onClick={() => setSelected(u.id)} disabled={u.isSystem}>
              <span className="row-item__main">
                <span className="row-item__title-row">
                  <span className="row-item__title">{u.handle}</span>
                  <Badge tone={u.role === 'ADMIN' ? 'emerald' : u.role === 'CREATOR' ? 'accent' : 'neutral'} size="sm">
                    {u.role}
                  </Badge>
                  {u.suspended && (
                    <Badge tone="orange" size="sm" outline>
                      Suspended
                    </Badge>
                  )}
                  {u.isSystem && (
                    <Badge tone="neutral" size="sm" outline>
                      System
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-secondary">
                  {u.username} · {u.rank} · {formatNumber(u.auraPoints)} aura
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {next && (
        <Button variant="ghost" onClick={() => void load(submitted, next)}>
          Load more
        </Button>
      )}
    </div>
  );
}

function UserDetail({ id, act, setAsk, onBack }: TabProps & { id: string; onBack: () => void }) {
  const uid = useId();
  const loadUser = useCallback(() => moderationApi.user(id), [id]);
  const { data, error, reload } = useLoad(loadUser);
  const user: AdminUserSummary | undefined = data?.user;
  const p = user?.profile;

  const changeRole = (role: UserRole) => {
    if (!p || role === p.role) return;
    void act(moderationApi.setRole(id, role), `Role changed to ${role}.`, reload);
  };

  return (
    <div className="stack-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← All users
      </Button>
      <Status error={error} loading={!data && !error} empty={false} emptyText="" />
      {user && p && (
        <>
          <div className="row-item">
            <div className="row-item__main">
              <div className="row-item__title-row">
                <h3 className="row-item__title">{p.handle}</h3>
                {p.suspendedAt && (
                  <Badge tone="orange" size="sm">
                    Suspended
                  </Badge>
                )}
              </div>
              <p className="text-xs text-secondary">
                {p.username} · {p.rank} · {formatNumber(p.auraPoints)} aura · {p.streakDays}-day streak · joined {when(p.createdAt)}
              </p>
              {p.suspendedAt && (
                <p className="text-xs text-orange">
                  Suspended {when(p.suspendedAt)}
                  {p.suspensionReason ? `: ${p.suspensionReason}` : ''}
                </p>
              )}
              <p className="text-xs text-secondary">
                {user.counts.questLogs} quests · {user.counts.workoutLogs} workouts · {user.counts.drops} drops ({user.counts.hiddenDrops} hidden) ·{' '}
                {user.counts.openReportsOnDrops} open reports on their drops
              </p>
            </div>
            <div className="row-item__side btn-row">
              <label htmlFor={`${uid}-role`} className="sr-only">
                Role
              </label>
              <select id={`${uid}-role`} className="input mod-role" value={p.role} onChange={(e) => changeRole(e.target.value as UserRole)}>
                {ADMIN_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {p.suspendedAt ? (
                <Button size="sm" variant="secondary" onClick={() => void act(moderationApi.unsuspend(id), 'Account unsuspended.', reload)}>
                  Unsuspend
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  leadingIcon={<UserX />}
                  onClick={() =>
                    setAsk({
                      title: `Suspend ${p.handle}`,
                      label: 'Reason (the user sees this)',
                      confirm: 'Suspend',
                      required: true,
                      run: (reason) => act(moderationApi.suspend(id, reason), 'Account suspended.', reload),
                    })
                  }
                >
                  Suspend
                </Button>
              )}
            </div>
          </div>
          <h4 className="fw-700">Recent completions</h4>
          <LogList logs={user.recentLogs} onRevert={(l) => revertAsk(act, setAsk, id, l, reload)} />
          <h4 className="fw-700">History</h4>
          <AuditList items={user.audit} />
        </>
      )}
    </div>
  );
}

function AuditList({ items }: { items: AuditEntry[] }) {
  if (items.length === 0) return <p className="text-xs text-secondary">No moderation actions yet.</p>;
  return (
    <ul className="stack-2 list-reset">
      {items.map((a) => {
        const reason = typeof a.details.reason === 'string' ? a.details.reason : typeof a.details.note === 'string' ? a.details.note : null;
        return (
          <li key={a.id} className="text-sm">
            <span className="fw-700">{AUDIT_ACTION_LABELS[a.action]}</span>{' '}
            <span className="text-xs text-secondary">
              by {a.actorHandle ?? 'deleted admin'} · {a.targetType.toLowerCase().replace('_', ' ')} · {when(a.createdAt)}
            </span>
            {reason && <span className="text-xs text-secondary"> · “{reason}”</span>}
          </li>
        );
      })}
    </ul>
  );
}

function AuditTab() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [next, setNext] = useState<{ createdAt: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (before: { createdAt: string; id: string } | null) => {
    const r = await moderationApi.audit(before);
    if (!r.ok) return setError(r.message);
    setError(null);
    setItems((prev) => (before && prev ? [...prev, ...r.data.items] : r.data.items));
    setNext(r.data.nextBefore);
  }, []);
  useEffect(() => {
    void load(null);
  }, [load]);
  return (
    <div className="stack-3">
      <Status error={error} loading={!items && !error} empty={false} emptyText="" />
      {items && <AuditList items={items} />}
      {next && (
        <Button variant="ghost" onClick={() => void load(next)}>
          Load older
        </Button>
      )}
    </div>
  );
}
