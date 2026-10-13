'use client';

import Image from 'next/image';
import type { MouseEvent } from 'react';
import { Moon, Sparkles, Sun, Volume2, VolumeX } from 'lucide-react';
import type { UserRole } from '@aurafit/shared';
import type { AppView } from '@/hooks/useHashView';
import type { Theme } from '@/lib/theme';
import { formatNumber } from '@/lib/format';
import { cx } from '@/lib/cx';
import { RoleSwitcher } from './RoleSwitcher';

interface SiteHeaderProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  activeRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  auraPoints: number;
  theme: Theme;
  onToggleTheme: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function SiteHeader({
  view,
  onNavigate,
  activeRole,
  onRoleChange,
  auraPoints,
  theme,
  onToggleTheme,
  soundEnabled,
  onToggleSound,
}: SiteHeaderProps) {
  const go = (target: AppView) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    onNavigate(target);
  };

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <div className="site-header__start">
          <a href="/" className="brand" onClick={go('LANDING')} aria-label="AuraFit home">
            <Image src="/logo.jpg" alt="" width={40} height={40} sizes="40px" className="brand__logo" priority />
            <span className="brand__text">
              <span className="brand__name">AURAFIT</span>
              <span className="brand__tag">Solo Leveling RPG Fitness</span>
            </span>
          </a>

          <nav aria-label="Primary" className="segmented">
            <a href="/" className={cx('segmented__item', view === 'LANDING' && 'is-active')} aria-current={view === 'LANDING' ? 'page' : undefined} onClick={go('LANDING')}>
              Home
            </a>
            <a href="#arena" className={cx('segmented__item', view === 'APP' && 'is-active')} aria-current={view === 'APP' ? 'page' : undefined} onClick={go('APP')}>
              Arena
            </a>
          </nav>
        </div>

        <div className="site-header__actions">
          {view === 'APP' && (
            <>
              <RoleSwitcher variant="header" activeRole={activeRole} onChange={onRoleChange} />
              <span className="aura-chip hide-below-md" title="Aura points">
                <Sparkles aria-hidden="true" className="aura-chip__icon" />
                <span className="sr-only">Aura points: </span>
                {formatNumber(auraPoints)}
              </span>
            </>
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
        </div>
      </div>
    </header>
  );
}
