import type { UserRole } from '@aurafit/shared';

export const ROLES: readonly UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'] as const;

export const ROLE_META: Record<UserRole, { short: string; persona: string; tone: 'accent' | 'pink' | 'emerald' }> = {
  MEMBER: { short: 'Athlete', persona: 'Athlete (Jinwoo Kai)', tone: 'accent' },
  CREATOR: { short: 'Creator', persona: 'Coach (Alex Thorne)', tone: 'pink' },
  ADMIN: { short: 'Admin', persona: 'Gym Overseer (Master Vance)', tone: 'emerald' },
};
