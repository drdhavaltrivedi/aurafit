'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { MODERATION_NOTE_MAX_LENGTH, REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason, type ReportTargetType } from '@aurafit/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { moderationApi } from '@/lib/moderation/client';

interface ReportDialogProps {
  /** null = closed. */
  target: { type: ReportTargetType; id: string; label: string } | null;
  onClose: () => void;
}

/** Report a workout drop or squad. The reported creator / squad never learns who reported them. */
export function ReportDialog({ target, onClose }: ReportDialogProps) {
  const toast = useToast();
  const uid = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setReason('SPAM');
    setNote('');
    setError(null);
  }, [target]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    const trimmed = note.trim();
    const r = await moderationApi.report({ targetType: target.type, targetId: target.id, reason, ...(trimmed ? { note: trimmed } : {}) });
    setBusy(false);
    if (r.ok || r.code === 'ALREADY_REPORTED') {
      toast.show(r.ok ? 'Thanks. A moderator will review your report.' : r.message, 'success');
      onClose();
      return;
    }
    setError(r.message);
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="sm"
      title={target?.type === 'SQUAD' ? 'Report squad' : 'Report workout'}
      description={target ? `${target.label}. Your report is anonymous.` : undefined}
      initialFocusRef={selectRef}
    >
      <form onSubmit={submit} noValidate className="form stack-3">
        {error ? (
          <p role="alert" className="form-alert">
            {error}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor={`${uid}-reason`} className="field__label">
            What&apos;s wrong?
          </label>
          <select ref={selectRef} id={`${uid}-reason`} className="input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-note`} className="field__label">
            Details (optional)
          </label>
          <textarea
            id={`${uid}-note`}
            className="input"
            rows={3}
            maxLength={MODERATION_NOTE_MAX_LENGTH}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="btn-row btn-row--end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
