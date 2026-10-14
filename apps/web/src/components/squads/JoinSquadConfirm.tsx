'use client';

import './squads.css';
import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Users } from 'lucide-react';
import { INVITE_CODE_LENGTH, isInviteCode, normalizeInviteCode, type MySquad } from '@aurafit/shared';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { squadsApi } from '@/lib/squads/client';

/** Confirmation step for /join/<CODE> (signed-in users only; the page redirects others to log in). */
export function JoinSquadConfirm({ code: initialCode }: { code: string | null }) {
  const router = useRouter();
  const uid = useId();
  const [current, setCurrent] = useState<MySquad | null | undefined>(undefined);
  const [code, setCode] = useState(initialCode ?? '');
  const [error, setError] = useState<string | null>(initialCode ? null : 'That invite link looks incomplete. Enter the code below.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void squadsApi.me().then((r) => {
      if (cancelled) return;
      if (r.ok) setCurrent(r.data.squad);
      else {
        setCurrent(null);
        setError(r.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeInviteCode(code);
    if (!isInviteCode(normalized)) {
      setError(`Invite codes are ${INVITE_CODE_LENGTH} letters and digits, e.g. K7MX2QPA.`);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await squadsApi.join(normalized);
    if (r.ok) {
      router.push('/arena#squad-panel');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(r.message);
  };

  return (
    <Card as="section" aria-labelledby="join-title" variant="feature">
      <div className="squad-head">
        <span className="squad-emblem" aria-hidden="true">
          <Users />
        </span>
        <div className="squad-head__text">
          <p className="eyebrow text-pink">Squad invite</p>
          <h1 id="join-title" className="squad-head__name">
            Join a squad
          </h1>
        </div>
      </div>

      {current === undefined ? (
        <p className="text-sm text-secondary" role="status">
          Checking your squad…
        </p>
      ) : current ? (
        <div className="stack-3">
          <p className="text-sm">
            You&apos;re already in <strong>{current.name}</strong> [{current.tag}]. Leave it in the arena first if you want to join a different squad.
          </p>
          <div className="squad-actions">
            <Link href="/arena#squad-panel" className="btn btn--primary btn--md">
              Go to my squad
            </Link>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <p className="text-sm text-secondary">You&apos;ve been invited to train together. Squads share a weekly aura goal and a leaderboard spot.</p>
          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-code`}>
              Invite code
            </label>
            <input
              id={`${uid}-code`}
              className="input input--code"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={INVITE_CODE_LENGTH + 4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="form__actions">
            <Link href="/arena" className="btn btn--ghost btn--md">
              Not now
            </Link>
            <Button type="submit" leadingIcon={<KeyRound />} disabled={busy} aria-busy={busy} id="join-confirm">
              {busy ? 'Joining…' : 'Join squad'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
