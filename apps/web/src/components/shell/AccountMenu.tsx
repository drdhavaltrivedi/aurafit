'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, Swords, UserCog } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { signOutAction } from '@/lib/auth/actions';
import type { Viewer } from '@/lib/auth/viewer';

/** Disclosure-style account menu: avatar + handle, with Arena / Account links and Sign out. */
export function AccountMenu({ viewer }: { viewer: Viewer }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar src={viewer.avatarUrl} alt="" name={viewer.username || viewer.handle} size={32} />
        <span className="hide-below-md">{viewer.handle}</span>
        <span className="sr-only">Account menu for {viewer.handle}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open && (
        <div id={panelId} className="account-menu__panel">
          <div className="account-menu__who">
            <p className="fw-700">{viewer.username}</p>
            <p className="text-xs text-secondary">{viewer.email ?? viewer.handle}</p>
          </div>
          <Link href="/arena" className="account-menu__item" onClick={() => setOpen(false)}>
            <Swords aria-hidden="true" /> My arena
          </Link>
          <Link href="/account" className="account-menu__item" onClick={() => setOpen(false)}>
            <UserCog aria-hidden="true" /> Account
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="account-menu__item">
              <LogOut aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
