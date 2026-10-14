'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ToastContext, type ToastAction, type ToastApi, type ToastOptions, type ToastTone } from '@/hooks/useToast';
import { cx } from '@/lib/cx';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

const DURATION_MS = 3500;
/** Toasts with an action stay longer so there is time to use the button. */
const ACTION_DURATION_MS = 8000;
const MAX_QUEUE = 4;

/**
 * Queue-based toasts: one visible at a time, each gets its full display time,
 * the timer is always cleared on change/unmount, and it pauses while hovered
 * or focused. The live region is always mounted so screen readers announce it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  const idRef = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'info', options?: ToastOptions) => {
    setQueue((q) => {
      if (q.length > 0 && q[q.length - 1].message === message) return q;
      const item: ToastItem = { id: ++idRef.current, message, tone, action: options?.action };
      // Keep the visible toast; drop the oldest pending one if the queue is full.
      return q.length >= MAX_QUEUE ? [q[0], ...q.slice(2), item] : [...q, item];
    });
  }, []);

  const dismiss = useCallback((id: number) => setQueue((q) => q.filter((t) => t.id !== id)), []);

  const current = queue[0];

  useEffect(() => {
    if (!current || paused) return;
    const timer = window.setTimeout(() => dismiss(current.id), current.action ? ACTION_DURATION_MS : DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [current, paused, dismiss]);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {current && (
          <div
            key={current.id}
            className={cx('toast', `toast--${current.tone}`)}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span className="toast__message">{current.message}</span>
            {current.action && (
              <button
                type="button"
                className="btn btn--primary btn--sm toast__action"
                onClick={() => {
                  dismiss(current.id);
                  current.action?.onClick();
                }}
              >
                {current.action.label}
              </button>
            )}
            <button type="button" className="toast__close" onClick={() => dismiss(current.id)} aria-label="Dismiss notification">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
