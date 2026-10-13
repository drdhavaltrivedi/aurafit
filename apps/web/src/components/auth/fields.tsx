'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Labelled input with an accessible hint / error (aria-describedby + aria-invalid). */
export function TextField({ id, label, error, hint, ...input }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

export function PasswordField({ id, label, error, hint, ...input }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="password-field">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="field__error">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="field__hint">
        {hint}
      </p>
    );
  return null;
}

/** Submit button that disables itself and shows a spinner while its form is pending. */
export function SubmitButton({ children, pendingLabel, ...rest }: ButtonProps & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      block
      disabled={pending || rest.disabled}
      aria-disabled={pending || undefined}
      leadingIcon={pending ? <Loader2 className="spin" /> : rest.leadingIcon}
      {...rest}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Form-level status message, announced politely (errors assertively). */
export function FormAlert({ status, message }: { status: 'idle' | 'error' | 'success'; message?: string }) {
  return (
    <div
      className={`alert ${status === 'error' ? 'alert--error' : status === 'success' ? 'alert--success' : ''}`}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}
    >
      {status !== 'idle' && message ? message : null}
    </div>
  );
}
