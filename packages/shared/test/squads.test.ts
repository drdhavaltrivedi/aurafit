import { describe, expect, it } from 'vitest';
import {
  buildMySquad,
  effectiveWeeklyGoal,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  isInviteCode,
  normalizeInviteCode,
  normalizeSquadName,
  normalizeSquadTag,
  parseSquadJoinLink,
  SQUAD_ROUTES,
  squadDaysLeft,
  squadInviteMessage,
  squadJoinDeepLink,
  squadJoinUrl,
  squadProgressPercent,
  squadWeekWindow,
  validateCreateSquad,
  validateJoinSquad,
  validateUpdateSquad,
  type SquadSnapshot,
} from '../src/index';

describe('invite codes', () => {
  it('alphabet has 32 unambiguous symbols', () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(32);
    for (const ch of '0O1I') expect(INVITE_CODE_ALPHABET).not.toContain(ch);
    expect(INVITE_CODE_LENGTH).toBe(8);
  });

  it('normalises and validates', () => {
    expect(normalizeInviteCode(' k7mx-2qpa ')).toBe('K7MX2QPA');
    expect(isInviteCode('K7MX2QPA')).toBe(true);
    for (const bad of ['K7MX2QP', 'K7MX2QPAB', 'K7MX2QP0', 'K7MX2QPO', 'K7MX2QP1', 'K7MX2QPI', 'k7mx2qpa', '', 42, null]) {
      expect(isInviteCode(bad), String(bad)).toBe(false);
    }
  });
});

describe('validateCreateSquad', () => {
  it('normalises name and tag', () => {
    expect(validateCreateSquad({ name: '  Night   Shift ', tag: ' #night ', icon: 'flame', extra: 1 })).toEqual({
      ok: true,
      value: { name: 'Night Shift', tag: 'NIGHT', icon: 'flame' },
    });
    expect(normalizeSquadName(' a  b ')).toBe('a b');
    expect(normalizeSquadTag('#ab1')).toBe('AB1');
  });

  it.each([
    [{ name: 'ab', tag: 'OK', icon: 'zap' }, 'name'],
    [{ name: 'x'.repeat(41), tag: 'OK', icon: 'zap' }, 'name'],
    [{ name: '-dash first', tag: 'OK', icon: 'zap' }, 'name'],
    [{ name: 'Emoji \u{1F525}', tag: 'OK', icon: 'zap' }, 'name'],
    [{ name: 'Fine', tag: 'A', icon: 'zap' }, 'tag'],
    [{ name: 'Fine', tag: 'TOOLONG', icon: 'zap' }, 'tag'],
    [{ name: 'Fine', tag: 'NO-PE', icon: 'zap' }, 'tag'],
    [{ name: 'Fine', tag: 'OK', icon: 'rocket' }, 'icon'],
    [{ tag: 'OK', icon: 'zap' }, 'name'],
  ])('rejects %j (%s)', (input, field) => {
    const r = validateCreateSquad(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toHaveProperty(field);
  });

  it('accepts unicode letters and allowed punctuation', () => {
    expect(validateCreateSquad({ name: "Équipe d'Or & Co.", tag: 'EQ1', icon: 'crown' }).ok).toBe(true);
    expect(validateCreateSquad(null).ok).toBe(false);
    expect(validateCreateSquad([]).ok).toBe(false);
  });
});

describe('validateJoinSquad / validateUpdateSquad', () => {
  it('join: normalises the code', () => {
    expect(validateJoinSquad({ code: 'k7mx 2qpa' })).toEqual({ ok: true, value: { code: 'K7MX2QPA' } });
    expect(validateJoinSquad({ code: 'nope' }).ok).toBe(false);
    expect(validateJoinSquad({}).ok).toBe(false);
  });

  it('update: any subset, at least one, goal range or null', () => {
    expect(validateUpdateSquad({ weeklyGoal: 12000 })).toEqual({ ok: true, value: { weeklyGoal: 12000 } });
    expect(validateUpdateSquad({ weeklyGoal: null })).toEqual({ ok: true, value: { weeklyGoal: null } });
    expect(validateUpdateSquad({ name: ' New  Name ', icon: 'trophy' })).toEqual({ ok: true, value: { name: 'New Name', icon: 'trophy' } });
    for (const g of [999, 50001, 1500.5, '2000']) {
      const r = validateUpdateSquad({ weeklyGoal: g });
      expect(r.ok, String(g)).toBe(false);
    }
    expect(validateUpdateSquad({}).ok).toBe(false);
    expect(validateUpdateSquad({ tag: 'NEW' }).ok).toBe(false); // tag is not editable
    expect(validateUpdateSquad({ icon: 'nope' }).ok).toBe(false);
  });
});

describe('weekly window', () => {
  it('Monday 00:00 UTC to next Monday', () => {
    const w = squadWeekWindow(new Date('2026-10-14T12:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(squadWeekWindow(new Date('2026-10-12T00:00:00Z')).start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(squadWeekWindow(new Date('2026-10-18T23:59:59Z')).start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(squadWeekWindow(new Date('2026-10-19T00:00:00Z')).start.toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('days left counts today', () => {
    expect(squadDaysLeft(new Date('2026-10-12T00:00:00Z'))).toBe(7);
    expect(squadDaysLeft(new Date('2026-10-14T12:00:00Z'))).toBe(5);
    expect(squadDaysLeft(new Date('2026-10-18T23:00:00Z'))).toBe(1);
  });

  it('goal and progress', () => {
    expect(effectiveWeeklyGoal(null, 1)).toBe(5000);
    expect(effectiveWeeklyGoal(null, 5)).toBe(25000);
    expect(effectiveWeeklyGoal(null, 0)).toBe(5000);
    expect(effectiveWeeklyGoal(12000, 5)).toBe(12000);
    expect(squadProgressPercent(0, 5000)).toBe(0);
    expect(squadProgressPercent(2499, 5000)).toBe(49);
    expect(squadProgressPercent(9000, 5000)).toBe(100);
    expect(squadProgressPercent(10, 0)).toBe(0);
  });
});

describe('buildMySquad', () => {
  const snapshot: SquadSnapshot = {
    weekStart: '2026-10-12T00:00:00.000Z',
    weekEnd: '2026-10-19T00:00:00.000Z',
    rank: 3,
    squad: {
      id: 'sq1',
      name: 'Night Shift',
      tag: 'NIGHT',
      icon: 'flame',
      maxMembers: 5,
      weeklyGoal: null,
      leaderId: 'p1',
      createdAt: '2026-10-01T00:00:00.000Z',
      inviteCode: 'K7MX2QPA',
    },
    members: [
      { profileId: 'p1', username: 'Lead', handle: '@lead', avatarUrl: '', rank: 'C-RANK', joinedAt: '2026-10-01T00:00:00Z', weeklyAura: 400 },
      { profileId: 'p2', username: 'Two', handle: '@two', avatarUrl: '', rank: 'E-RANK', joinedAt: '2026-10-02T00:00:00Z', weeklyAura: 900 },
    ],
  };
  const now = new Date('2026-10-14T12:00:00Z');

  it('leader view: invite code, roles, progress against the automatic goal', () => {
    const s = buildMySquad(snapshot, 'p1', now);
    expect(s).toMatchObject({ isLeader: true, inviteCode: 'K7MX2QPA', memberCount: 2, rank: 3, weeklyGoal: null });
    expect(s.progress).toEqual({ aura: 1300, goal: 10000, goalIsCustom: false, percent: 13, remaining: 8700, daysLeft: 5 });
    expect(s.members.map((m) => [m.profileId, m.role, m.isYou])).toEqual([
      ['p2', 'MEMBER', false],
      ['p1', 'LEADER', true],
    ]);
  });

  it('member view: no invite code; custom goal', () => {
    const s = buildMySquad({ ...snapshot, squad: { ...snapshot.squad, weeklyGoal: 1000 } }, 'p2', now);
    expect(s.isLeader).toBe(false);
    expect(s.inviteCode).toBeNull();
    expect(s.progress).toMatchObject({ goal: 1000, goalIsCustom: true, percent: 100, remaining: 0 });
  });
});

describe('join links', () => {
  it('builds web and app links', () => {
    expect(squadJoinUrl('https://aurafit.app/', 'K7MX2QPA')).toBe('https://aurafit.app/join/K7MX2QPA');
    expect(squadJoinDeepLink('K7MX2QPA')).toBe('aurafit://join/K7MX2QPA');
    expect(squadInviteMessage({ name: 'Night Shift', tag: 'NIGHT' }, 'K7MX2QPA', 'https://aurafit.app/join/K7MX2QPA')).toContain(
      'Night Shift [NIGHT]',
    );
    expect(SQUAD_ROUTES.member('a b')).toBe('/api/v1/squads/me/members/a%20b');
  });

  it.each([
    ['aurafit://join/K7MX2QPA', 'K7MX2QPA'],
    ['aurafit://join/k7mx2qpa/', 'K7MX2QPA'],
    ['https://aurafit.app/join/K7MX2QPA?utm=x#y', 'K7MX2QPA'],
    ['exp://192.168.1.2:8081/--/join/K7MX2QPA', 'K7MX2QPA'],
    ['aurafit://join/NOTVALID0', null],
    ['aurafit://quests', null],
    ['https://evil.example/join/../../K7MX2QPA', null],
    ['aurafit://join/%E0%A4%A', null],
    ['', null],
    [null, null],
  ])('parseSquadJoinLink(%s) = %s', (url, code) => {
    expect(parseSquadJoinLink(url)).toBe(code);
  });
});
