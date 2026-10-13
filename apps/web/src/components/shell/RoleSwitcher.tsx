'use client';

import { Crown, Shield, Zap } from 'lucide-react';
import type { UserRole } from '@aurafit/shared';
import { ROLES, ROLE_META } from '@/lib/roles';
import { cx } from '@/lib/cx';

const ICONS: Record<UserRole, typeof Zap> = { MEMBER: Zap, CREATOR: Crown, ADMIN: Shield };

interface RoleSwitcherProps {
  activeRole: UserRole;
  onChange: (role: UserRole) => void;
  variant: 'header' | 'bottom';
}

/**
 * Demo account switcher. Rendered inline in the header on wide screens and as
 * a fixed bottom navigation bar on phones (each variant hides via CSS).
 */
export function RoleSwitcher({ activeRole, onChange, variant }: RoleSwitcherProps) {
  const Wrapper = variant === 'bottom' ? 'nav' : 'div';
  return (
    <Wrapper
      className={cx('role-switcher', `role-switcher--${variant}`)}
      aria-label="Switch demo role"
      {...(variant === 'header' ? { role: 'group' } : {})}
    >
      {ROLES.map((role) => {
        const Icon = ICONS[role];
        const active = role === activeRole;
        return (
          <button
            key={role}
            type="button"
            id={`nav-role-${variant}-${role.toLowerCase()}`}
            className={cx('role-switcher__btn', active && 'is-active')}
            aria-pressed={active}
            onClick={() => onChange(role)}
          >
            <Icon className="role-switcher__icon" aria-hidden="true" />
            <span>{ROLE_META[role].short}</span>
          </button>
        );
      })}
    </Wrapper>
  );
}
