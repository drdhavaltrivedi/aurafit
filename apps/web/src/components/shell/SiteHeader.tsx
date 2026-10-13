'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react';
import type { UserRole } from '@aurafit/shared';
import type { Viewer } from '@/lib/auth/viewer';
import type { Theme } from '@/lib/theme';
import { formatNumber } from '@/lib/format';
import { cx } from '@/lib/cx';
import { Badge } from '@/components/ui/Badge';
import { RoleSwitcher } from './RoleSwitcher';
import { AccountMenu } from './AccountMenu';

export type AppPage = 'landing' | 'demo' | 'arena';

interface SiteHeaderProps {
  page: AppPage;
  viewer: Viewer | null;
  /** Arena pages: aura shown in the header chip. */
  auraPoints?: number;
  /** Demo arena only: persona switcher. */
  activeRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  theme: Theme;
  onToggleTheme: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function SiteHeader({
  page,
  viewer,
  auraPoints,
  activeRole,
  onRoleChange,
  theme,
  onToggleTheme,
  soundEnabled,
  onToggleSound,
}: SiteHeaderProps) {
  const inArena = page !== 'landing';
  const arenaHref = viewer ? '/arena' : '/demo';

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <div className="site-header__start">
          <Link href="/" className="brand" aria-label="AuraFit home">
            <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="brand__logo" priority />
            <span className="brand__text">
              <span className="brand__name">AURAFIT</span>
              <span className="brand__tag">Solo Leveling RPG Fitness</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="segmented">
            <Link href="/" className={cx('segmented__item', !inArena && 'is-active')} aria-current={!inArena ? 'page' : undefined}>
              Home
            </Link>
            <Link href={arenaHref} className={cx('segmented__item', inArena && 'is-active')} aria-current={inArena ? 'page' : undefined}>
              Arena
            </Link>
          </nav>
        </div>

        <div className="site-header__actions">
          {page === 'demo' && (
            <Badge tone="orange" outline size="sm" title="Progress is saved in this browser only">
              Demo mode
            </Badge>
          )}
          {page === 'demo' && activeRole && onRoleChange && (
            <RoleSwitcher variant="header" activeRole={activeRole} onChange={onRoleChange} />
          )}
          {inArena && auraPoints !== undefined && (
            <span className="aura-chip hide-below-md" title="Aura points">
              <Sparkles aria-hidden="true" className="aura-chip__icon" />
              <span className="sr-only">Aura points: </span>
              {formatNumber(auraPoints)}
            </span>
          )}
          <button
            type="button"
            id="theme-toggle-btn"
            className="btn btn--secondary btn--md btn--icon"
            onClick={onToggleTheme}
            aria-label="Dark mode"
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
          <button
            type="button"
            id="sound-toggle-btn"
            className={cx('btn btn--secondary btn--md btn--icon', soundEnabled && 'is-on')}
            onClick={onToggleSound}
            aria-label="Sound effects"
            aria-pressed={soundEnabled}
            title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          >
            {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          {viewer ? (
            <AccountMenu viewer={viewer} />
          ) : (
            <>
              <Link href="/login" className="btn btn--ghost btn--md">
                Log in
              </Link>
              <Link href="/signup" className="btn btn--primary btn--md hide-below-md">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
