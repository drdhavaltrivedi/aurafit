'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Rocket } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  CATEGORY_LABELS,
  DROP_CATEGORIES,
  DROP_LIMITS,
  VIBE_TAGS,
  validateDropDraft,
  type DropDraft,
  type DropErrors,
  type ValidDrop,
} from '@/lib/drops';

interface CreateDropModalProps {
  open: boolean;
  onClose: () => void;
  /** Resolves true when the drop was published. */
  onSubmit: (drop: ValidDrop) => Promise<boolean>;
}

const EMPTY: DropDraft = { title: '', vibe: VIBE_TAGS[0], category: DROP_CATEGORIES[0], duration: '15', multiplier: '1.5' };
const ORDER: (keyof DropDraft)[] = ['title', 'vibe', 'category', 'duration', 'multiplier'];

export function CreateDropModal({ open, onClose, onSubmit }: CreateDropModalProps) {
  const [draft, setDraft] = useState<DropDraft>(EMPTY);
  const [errors, setErrors] = useState<DropErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const id = (k: keyof DropDraft) => `${uid}-${k}`;

  const update = (k: keyof DropDraft) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [k]: value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const close = () => {
    setErrors({});
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const result = validateDropDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const first = ORDER.find((k) => result.errors[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(first))}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      if (await onSubmit(result.value)) {
        setDraft(EMPTY);
        setErrors({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldProps = (k: keyof DropDraft) => ({
    id: id(k),
    name: k,
    value: draft[k],
    onChange: update(k),
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `${id(k)}-error` : `${id(k)}-hint`,
    className: 'input',
  });

  const errorOrHint = (k: keyof DropDraft, hint: string) =>
    errors[k] ? (
      <p id={`${id(k)}-error`} className="field__error">
        {errors[k]}
      </p>
    ) : (
      <p id={`${id(k)}-hint`} className="field__hint">
        {hint}
      </p>
    );

  return (
    <Modal open={open} onClose={close} title="Drop a new routine" description="Publish a routine for every Hunter on the platform." size="sm" initialFocusRef={titleRef}>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="form">
        <div className="field">
          <label htmlFor={id('title')} className="field__label">
            Routine title
          </label>
          <input
            {...fieldProps('title')}
            ref={titleRef}
            type="text"
            required
            autoComplete="off"
            maxLength={DROP_LIMITS.titleMax + 20}
            placeholder="e.g. 10-Min Core Reset"
          />
          {errorOrHint('title', `${DROP_LIMITS.titleMin}–${DROP_LIMITS.titleMax} characters.`)}
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor={id('vibe')} className="field__label">
              Music / vibe tag
            </label>
            <select {...fieldProps('vibe')}>
              {VIBE_TAGS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {errorOrHint('vibe', 'Sets the cadence.')}
          </div>
          <div className="field">
            <label htmlFor={id('category')} className="field__label">
              Category
            </label>
            <select {...fieldProps('category')}>
              {DROP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            {errorOrHint('category', 'Helps Hunters find it.')}
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label htmlFor={id('duration')} className="field__label">
              Duration (minutes)
            </label>
            <input
              {...fieldProps('duration')}
              type="number"
              inputMode="numeric"
              min={DROP_LIMITS.durationMin}
              max={DROP_LIMITS.durationMax}
              step={1}
              required
            />
            {errorOrHint('duration', `${DROP_LIMITS.durationMin}–${DROP_LIMITS.durationMax} min.`)}
          </div>
          <div className="field">
            <label htmlFor={id('multiplier')} className="field__label">
              Aura multiplier
            </label>
            <input
              {...fieldProps('multiplier')}
              type="number"
              inputMode="decimal"
              min={DROP_LIMITS.multiplierMin}
              max={DROP_LIMITS.multiplierMax}
              step={0.1}
              required
            />
            {errorOrHint('multiplier', `${DROP_LIMITS.multiplierMin.toFixed(1)}×–${DROP_LIMITS.multiplierMax.toFixed(1)}×`)}
          </div>
        </div>

        <div className="form__actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" leadingIcon={<Rocket />} disabled={submitting} aria-disabled={submitting || undefined}>
            {submitting ? 'Publishing…' : 'Publish routine'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
