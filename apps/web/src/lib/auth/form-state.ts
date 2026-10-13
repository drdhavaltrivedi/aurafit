import type { FieldErrors } from './validation';

export interface AuthFormState {
  status: 'idle' | 'error' | 'success';
  /** Form-level message (shown in a live region). */
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so the email field keeps its value after a server round-trip. */
  email?: string;
}

export const INITIAL_AUTH_STATE: AuthFormState = { status: 'idle' };
