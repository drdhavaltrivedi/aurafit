'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { DELETE_ACCOUNT_CONFIRMATION } from '@aurafit/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api-client';

/** Danger zone: typed-confirmation modal that calls DELETE /api/v1/me. */
export function DeleteAccountPanel({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = typed === DELETE_ACCOUNT_CONFIRMATION;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await api.deleteAccount();
    if (res.ok) {
      // Session cookies were cleared by the server; full reload drops any client state.
      window.location.assign('/?account=deleted');
      return;
    }
    setBusy(false);
    if (res.status === 401) {
      window.location.assign('/login?next=/account');
      return;
    }
    setError(res.message);
  };

  return (
    <Card as="section" className="danger-zone" aria-labelledby="danger-zone-title">
      <div className="stack-2">
        <h2 id="danger-zone-title" className="danger-zone__title">
          <AlertTriangle aria-hidden="true" className="icon-inline" /> Danger zone
        </h2>
        <p className="text-sm text-secondary">
          Deleting your account permanently removes your sign-in, your profile ({handle}), your Aura, rank and streak, your quest and
          workout history, and any workout drops you published. This cannot be undone.
        </p>
      </div>
      <div>
        <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setOpen(true)} aria-haspopup="dialog">
          Delete account
        </Button>
      </div>

      <Modal
        open={open}
        onClose={close}
        size="sm"
        eyebrow={<span className="text-danger">Permanent action</span>}
        title="Delete your account?"
        description={`All data for ${handle} will be erased immediately. You will be signed out.`}
        initialFocusRef={inputRef}
      >
        <form className="stack-3" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="delete-confirm" className="field__label">
              Type <strong>{DELETE_ACCOUNT_CONFIRMATION}</strong> to confirm
            </label>
            <input
              ref={inputRef}
              id="delete-confirm"
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'delete-confirm-error' : undefined}
            />
          </div>
          <p id="delete-confirm-error" className="alert alert--error" role="alert">
            {error ?? ''}
          </p>
          <div className="btn-row btn-row--end">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!confirmed || busy} aria-busy={busy || undefined}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
