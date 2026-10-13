'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ToastContext, type ToastApi, type ToastTone } from '@/hooks/useToast';
import { cx } from '@/lib/cx';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const DURATION_MS = 3500;
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

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    setQueue((q) => {
      if (q.length > 0 && q[q.length - 1].message === message) return q;
      const item = { id: ++idRef.current, message, tone };
      // Keep the visible toast; drop the oldest pending one if the queue is full.
      return q.length >= MAX_QUEUE ? [q[0], ...q.slice(2), item] : [...q, item];
    });
  }, []);

  const dismiss = useCallback((id: number) => setQueue((q) => q.filter((t) => t.id !== id)), []);

  const current = queue[0];

  useEffect(() => {
    if (!current || paused) return;
    const timer = window.setTimeout(() => dismiss(current.id), DURATION_MS);
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
            <button type="button" className="toast__close" onClick={() => dismiss(current.id)} aria-label="Dismiss notification">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
