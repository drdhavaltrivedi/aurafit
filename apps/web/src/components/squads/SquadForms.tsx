'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ICON_KEYS,
  INVITE_CODE_LENGTH,
  isInviteCode,
  normalizeInviteCode,
  squadNameError,
  squadTagError,
  SQUAD_NAME_MAX_LENGTH,
  SQUAD_TAG_MAX_LENGTH,
  SQUAD_WEEKLY_GOAL_MAX,
  SQUAD_WEEKLY_GOAL_MIN,
  weeklyGoalError,
  type IconKey,
  type MySquad,
} from '@aurafit/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AppIcon } from '@/components/ui/AppIcon';
import { formatNumber } from '@/lib/format';

/** Outcome of a submit: null on success, or errors to show (field-level and/or form-level). */
export type SubmitErrors = { form?: string; name?: string; tag?: string; code?: string; weeklyGoal?: string } | null;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

function IconPicker({ value, onChange, name }: { value: IconKey; onChange: (k: IconKey) => void; name: string }) {
  return (
    <fieldset className="icon-picker">
      <legend>Icon</legend>
      {ICON_KEYS.map((k) => (
        <label key={k} className="icon-picker__option">
          <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} aria-label={k} />
          <span aria-hidden="true">
            <AppIcon name={k} />
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <p className="alert alert--error" role="alert">
      {message}
    </p>
  ) : null;
}

export function CreateSquadModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: { name: string; tag: string; icon: IconKey }) => Promise<SubmitErrors>;
}) {
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [icon, setIcon] = useState<IconKey>('swords');
  const [errors, setErrors] = useState<NonNullable<SubmitErrors>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local = { name: squadNameError(name) ?? undefined, tag: squadTagError(tag) ?? undefined };
    if (local.name || local.tag) {
      setErrors(local);
      document.getElementById(local.name ? `${uid}-name` : `${uid}-tag`)?.focus();
      return;
    }
    setBusy(true);
    const r = await onSubmit({ name, tag, icon });
    setBusy(false);
    setErrors(r ?? {});
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a squad" description="Up to 5 hunters. You'll be the leader and get an invite code to share." initialFocusRef={nameRef}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError message={errors.form} />
        <Field id={`${uid}-name`} label="Squad name" hint={`3-${SQUAD_NAME_MAX_LENGTH} characters.`} error={errors.name}>
          <input
            ref={nameRef}
            id={`${uid}-name`}
            className="input"
            value={name}
            maxLength={SQUAD_NAME_MAX_LENGTH + 10}
            autoComplete="off"
            aria-invalid={!!errors.name}
            aria-describedby={describedBy(`${uid}-name`, errors.name, 'x')}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id={`${uid}-tag`} label="Tag" hint={`2-${SQUAD_TAG_MAX_LENGTH} letters or digits, shown as [TAG].`} error={errors.tag}>
          <input
            id={`${uid}-tag`}
            className="input input--code"
            value={tag}
            maxLength={SQUAD_TAG_MAX_LENGTH + 1}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!errors.tag}
            aria-describedby={describedBy(`${uid}-tag`, errors.tag, 'x')}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
          />
        </Field>
        <IconPicker value={icon} onChange={setIcon} name={`${uid}-icon`} />
        <div className="form__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy} id="squad-create-submit">
            {busy ? 'Creating…' : 'Create squad'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function JoinSquadModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => Promise<SubmitErrors>;
}) {
  const uid = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<NonNullable<SubmitErrors>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeInviteCode(code);
    if (!isInviteCode(normalized)) {
      setErrors({ code: `Invite codes are ${INVITE_CODE_LENGTH} letters and digits, e.g. K7MX2QPA.` });
      ref.current?.focus();
      return;
    }
    setBusy(true);
    const r = await onSubmit(normalized);
    setBusy(false);
    setErrors(r ?? {});
  };

  return (
    <Modal open={open} onClose={onClose} title="Join a squad" description="Enter the invite code your squad leader shared." size="sm" initialFocusRef={ref}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError message={errors.form} />
        <Field id={`${uid}-code`} label="Invite code" error={errors.code}>
          <input
            ref={ref}
            id={`${uid}-code`}
            className="input input--code"
            value={code}
            maxLength={INVITE_CODE_LENGTH + 4}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-invalid={!!errors.code}
            aria-describedby={describedBy(`${uid}-code`, errors.code)}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <div className="form__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy} id="squad-join-submit">
            {busy ? 'Joining…' : 'Join squad'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function EditSquadModal({
  open,
  squad,
  onClose,
  onSubmit,
}: {
  open: boolean;
  squad: MySquad;
  onClose: () => void;
  onSubmit: (patch: { name?: string; icon?: IconKey; weeklyGoal?: number | null }) => Promise<SubmitErrors>;
}) {
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(squad.name);
  const [icon, setIcon] = useState<IconKey>(squad.icon);
  const [auto, setAuto] = useState(squad.weeklyGoal === null);
  const [goal, setGoal] = useState(String(squad.weeklyGoal ?? squad.progress.goal));
  const [errors, setErrors] = useState<NonNullable<SubmitErrors>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(squad.name);
    setIcon(squad.icon);
    setAuto(squad.weeklyGoal === null);
    setGoal(String(squad.weeklyGoal ?? squad.progress.goal));
    setErrors({});
    setBusy(false);
  }, [open, squad]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const goalNum = auto ? null : Number(goal);
    const local = { name: squadNameError(name) ?? undefined, weeklyGoal: auto ? undefined : weeklyGoalError(goalNum) ?? undefined };
    if (local.name || local.weeklyGoal) {
      setErrors(local);
      return;
    }
    const patch: { name?: string; icon?: IconKey; weeklyGoal?: number | null } = {};
    if (name.trim().replace(/\s+/g, ' ') !== squad.name) patch.name = name;
    if (icon !== squad.icon) patch.icon = icon;
    if (goalNum !== squad.weeklyGoal) patch.weeklyGoal = goalNum;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    const r = await onSubmit(patch);
    setBusy(false);
    setErrors(r ?? {});
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit squad" initialFocusRef={nameRef}>
      <form className="form" onSubmit={submit} noValidate>
        <FormError message={errors.form} />
        <Field id={`${uid}-name`} label="Squad name" error={errors.name}>
          <input
            ref={nameRef}
            id={`${uid}-name`}
            className="input"
            value={name}
            autoComplete="off"
            aria-invalid={!!errors.name}
            aria-describedby={describedBy(`${uid}-name`, errors.name)}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <IconPicker value={icon} onChange={setIcon} name={`${uid}-icon`} />
        <div className="field">
          <label className="row-between text-sm fw-600" style={{ justifyContent: 'flex-start' }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Automatic weekly goal (5,000 per member)
          </label>
        </div>
        {!auto && (
          <Field
            id={`${uid}-goal`}
            label="Weekly aura goal"
            hint={`${formatNumber(SQUAD_WEEKLY_GOAL_MIN)} to ${formatNumber(SQUAD_WEEKLY_GOAL_MAX)}.`}
            error={errors.weeklyGoal}
          >
            <input
              id={`${uid}-goal`}
              className="input"
              type="number"
              inputMode="numeric"
              min={SQUAD_WEEKLY_GOAL_MIN}
              max={SQUAD_WEEKLY_GOAL_MAX}
              step={500}
              value={goal}
              aria-invalid={!!errors.weeklyGoal}
              aria-describedby={describedBy(`${uid}-goal`, errors.weeklyGoal, 'x')}
              onChange={(e) => setGoal(e.target.value)}
            />
          </Field>
        )}
        <div className="form__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" initialFocusRef={cancelRef}>
      <div className="stack-3">
        <div className="text-sm text-secondary">{body}</div>
        <div className="form__actions">
          <button ref={cancelRef} type="button" className="btn btn--ghost btn--md" onClick={onClose}>
            Cancel
          </button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={busy}
            aria-busy={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
