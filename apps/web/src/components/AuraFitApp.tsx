'use client';

import { useCallback, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@aurafit/shared';
import { useTheme } from '@/hooks/useTheme';
import { useSound } from '@/hooks/useSound';
import { useToast } from '@/hooks/useToast';
import { useDemoAuraFitState, useServerAuraFitState, type AuraFitState } from '@/hooks/useAuraFitState';
import type { Viewer } from '@/lib/auth/viewer';
import { ROLE_META } from '@/lib/roles';
import { cx } from '@/lib/cx';
import { STORAGE_KEYS, writeStorage } from '@/lib/storage';
import { sound } from '@/utils/audio';
import { SiteHeader, type AppPage } from './shell/SiteHeader';
import { SiteFooter } from './shell/SiteFooter';
import { RoleSwitcher } from './shell/RoleSwitcher';
import { LandingView } from './landing/LandingView';
import { ArenaView } from './app/ArenaView';

interface AuraFitAppProps {
  page: AppPage;
  viewer: Viewer | null;
}

export function AuraFitApp({ page, viewer }: AuraFitAppProps) {
  if (page === 'landing') return <LandingApp viewer={viewer} />;
  if (page === 'demo') return <DemoArenaApp viewer={viewer} />;
  return <ServerArenaApp viewer={viewer} />;
}

function Chrome({
  page,
  viewer,
  state,
  onRoleChange,
  children,
}: {
  page: AppPage;
  viewer: Viewer | null;
  state?: AuraFitState;
  onRoleChange?: (role: UserRole) => void;
  children: ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  const { enabled: soundEnabled, toggle: toggleSound } = useSound();
  const handleToggleTheme = useCallback(() => {
    toggleTheme();
    sound.playClick();
  }, [toggleTheme]);

  const inArena = page !== 'landing';
  return (
    <>
      <SiteHeader
        page={page}
        viewer={viewer}
        auraPoints={state?.hydrated ? state.activeUser.auraPoints : undefined}
        activeRole={state?.activeRole}
        onRoleChange={onRoleChange}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
      <main id="main-content" tabIndex={-1} className={cx('site-main', inArena && 'site-main--app')}>
        {children}
      </main>
      {page === 'demo' && state && onRoleChange && <RoleSwitcher variant="bottom" activeRole={state.activeRole} onChange={onRoleChange} />}
      <SiteFooter synced={page === 'arena'} />
    </>
  );
}

function LandingApp({ viewer }: { viewer: Viewer | null }) {
  const router = useRouter();

  // Old links used /#arena for the (demo) arena.
  useEffect(() => {
    if (window.location.hash === '#arena') router.replace(viewer ? '/arena' : '/demo');
  }, [router, viewer]);

  const enterArena = useCallback(
    (role?: UserRole) => {
      sound.playClick();
      if (viewer && !role) {
        router.push('/arena');
        return;
      }
      // Role cards on the landing page preview a persona in demo mode.
      if (role) writeStorage(STORAGE_KEYS.role, role);
      router.push('/demo');
    },
    [router, viewer],
  );

  return (
    <Chrome page="landing" viewer={viewer}>
      <LandingView onEnterArena={enterArena} />
    </Chrome>
  );
}

function DemoArenaApp({ viewer }: { viewer: Viewer | null }) {
  const state = useDemoAuraFitState();
  const toast = useToast();
  const { activeRole, setActiveRole } = state;

  const switchRole = useCallback(
    (role: UserRole) => {
      if (role === activeRole || !setActiveRole) return;
      setActiveRole(role);
      sound.playClick();
      toast.show(`Switched to ${ROLE_META[role].persona}`);
    },
    [activeRole, setActiveRole, toast],
  );

  return (
    <Chrome page="demo" viewer={viewer} state={state} onRoleChange={switchRole}>
      <ArenaView state={state} />
    </Chrome>
  );
}

function ServerArenaApp({ viewer }: { viewer: Viewer | null }) {
  const state = useServerAuraFitState();
  return (
    <Chrome page="arena" viewer={viewer} state={state}>
      <ArenaView state={state} />
    </Chrome>
  );
}
