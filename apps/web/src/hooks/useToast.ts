'use client';

import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Optional button inside the toast (e.g. "Share your card"); clicking it also dismisses the toast. */
  action?: ToastAction;
}

export interface ToastApi {
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
