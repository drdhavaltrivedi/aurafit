import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, type UserPermission, type UserRole } from '../src/index';

const ALL_PERMISSIONS: UserPermission[] = [
  'DO_QUESTS',
  'START_WORKOUT',
  'JOIN_SQUAD',
  'PUBLISH_WORKOUT_DROP',
  'VIEW_CREATOR_ANALYTICS',
  'MANAGE_SQUAD_MEMBERS',
  'VIEW_GYM_LEADERBOARD',
  'MANAGE_GYM_AFFILIATION',
  'AUDIT_ANTI_CHEAT',
  'ADJUST_AURA_ECONOMY',
  'ASSIGN_USER_ROLES',
];
const ROLES: UserRole[] = ['MEMBER', 'CREATOR', 'ADMIN'];

describe('ROLE_PERMISSIONS', () => {
  it('defines exactly the three roles', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
  });

  it('has no duplicate permissions per role', () => {
    for (const role of ROLES) {
      expect(new Set(ROLE_PERMISSIONS[role]).size).toBe(ROLE_PERMISSIONS[role].length);
    }
  });

  it('roles are strictly hierarchical: MEMBER ⊂ CREATOR ⊂ ADMIN', () => {
    for (const p of ROLE_PERMISSIONS.MEMBER) expect(ROLE_PERMISSIONS.CREATOR).toContain(p);
    for (const p of ROLE_PERMISSIONS.CREATOR) expect(ROLE_PERMISSIONS.ADMIN).toContain(p);
    expect(ROLE_PERMISSIONS.CREATOR.length).toBeGreaterThan(ROLE_PERMISSIONS.MEMBER.length);
    expect(ROLE_PERMISSIONS.ADMIN.length).toBeGreaterThan(ROLE_PERMISSIONS.CREATOR.length);
  });

  it('ADMIN has every permission', () => {
    expect([...ROLE_PERMISSIONS.ADMIN].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('MEMBER has the expected baseline permissions', () => {
    expect([...ROLE_PERMISSIONS.MEMBER].sort()).toEqual(
      ['DO_QUESTS', 'JOIN_SQUAD', 'START_WORKOUT', 'VIEW_GYM_LEADERBOARD'].sort()
    );
  });
});

describe('hasPermission', () => {
  it('matches ROLE_PERMISSIONS for every role/permission pair', () => {
    for (const role of ROLES) {
      for (const p of ALL_PERMISSIONS) {
        expect(hasPermission(role, p)).toBe(ROLE_PERMISSIONS[role].includes(p));
      }
    }
  });

  it('keeps privileged actions away from lower roles', () => {
    expect(hasPermission('MEMBER', 'PUBLISH_WORKOUT_DROP')).toBe(false);
    expect(hasPermission('MEMBER', 'ASSIGN_USER_ROLES')).toBe(false);
    expect(hasPermission('CREATOR', 'AUDIT_ANTI_CHEAT')).toBe(false);
    expect(hasPermission('CREATOR', 'ADJUST_AURA_ECONOMY')).toBe(false);
    expect(hasPermission('CREATOR', 'PUBLISH_WORKOUT_DROP')).toBe(true);
    expect(hasPermission('ADMIN', 'ASSIGN_USER_ROLES')).toBe(true);
  });

  it('returns false (does not throw) for unknown or hostile runtime roles', () => {
    for (const role of ['GUEST', '', 'admin', 'constructor', '__proto__', 'toString', 'hasOwnProperty', null, undefined, 42]) {
      expect(() => hasPermission(role as unknown as UserRole, 'DO_QUESTS')).not.toThrow();
      expect(hasPermission(role as unknown as UserRole, 'DO_QUESTS')).toBe(false);
    }
  });

  it('returns false for unknown permissions', () => {
    expect(hasPermission('ADMIN', 'DELETE_EVERYTHING' as UserPermission)).toBe(false);
  });
});
