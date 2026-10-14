/** Route tests for /api/v1/squads/** with an in-memory squad repository. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MySquadResponse, SquadActivityResponse, SquadLeaderboardResponse } from '@aurafit/shared';
import { AUTH_ID, FakeRepo, PROFILE_ID } from '@/test/fake-repo';
import { FakeSquadRepo } from '@/test/fake-squad-repo';

const h = vi.hoisted(() => ({ configured: true, repo: null as unknown, srepo: null as unknown }));

vi.mock('@/lib/supabase/env', () => ({
  isAuthConfigured: () => h.configured,
  getPublicSupabaseConfig: () => (h.configured ? { url: 'https://example.supabase.co', key: 'sb_publishable_x' } : null),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createTokenVerifier: () => ({
    auth: {
      getClaims: async (token?: string) =>
        token === 'good.token.sig' ? { data: { claims: { sub: AUTH_ID } }, error: null } : { data: null, error: new Error('bad jwt') },
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: null, error: null }) } }),
}));
vi.mock('@/lib/data', () => ({ getRepository: () => h.repo }));
vi.mock('@/lib/squads', () => ({ getSquadRepository: () => h.srepo }));

import { mutationLimiter } from '@/lib/api/rate-limit';
import { squadActionLimiter } from '@/lib/squads/http';
import { POST as create } from './route';
import { GET as getMe, PATCH as patchMe } from './me/route';
import { POST as join } from './join/route';
import { POST as leave } from './leave/route';
import { POST as regenerate } from './me/invite-code/route';
import { DELETE as removeMember } from './me/members/[profileId]/route';
import { GET as activity } from './me/activity/route';
import { GET as leaderboard } from './leaderboard/route';

const BASE = 'http://localhost/api/v1/squads';
const AUTH = { authorization: 'Bearer good.token.sig' };
const JSON_AUTH = { ...AUTH, 'content-type': 'application/json' };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THIRD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let srepo: FakeSquadRepo;

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = JSON_AUTH) =>
  new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const params = (profileId: string) => ({ params: Promise.resolve({ profileId }) });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body).toMatchObject({ code, error: expect.any(String) });
  return body;
}

beforeEach(() => {
  h.configured = true;
  h.repo = new FakeRepo();
  srepo = new FakeSquadRepo();
  srepo.addProfile(PROFILE_ID, '@jinwoo', 300);
  srepo.addProfile(OTHER, '@other', 900);
  srepo.addProfile(THIRD, '@third', 0);
  h.srepo = srepo;
  mutationLimiter.reset();
  squadActionLimiter.reset();
});
afterEach(() => vi.restoreAllMocks());

describe('auth + config', () => {
  it('401 without credentials on every member endpoint; 503 without a squad repo', async () => {
    const none = {};
    await expectError(await getMe(req('/me', 'GET', undefined, none)), 401, 'UNAUTHORIZED');
    await expectError(await create(req('', 'POST', { name: 'Abc', tag: 'AB', icon: 'zap' }, { 'content-type': 'application/json' })), 401, 'UNAUTHORIZED');
    await expectError(await join(req('/join', 'POST', { code: 'AAAAAAAB' }, { 'content-type': 'application/json' })), 401, 'UNAUTHORIZED');
    await expectError(await leave(req('/leave', 'POST', undefined, none)), 401, 'UNAUTHORIZED');
    await expectError(await activity(req('/me/activity', 'GET', undefined, none)), 401, 'UNAUTHORIZED');
    h.srepo = null;
    await expectError(await getMe(req('/me', 'GET', undefined, AUTH)), 503, 'NOT_CONFIGURED');
    await expectError(await leaderboard(), 503, 'NOT_CONFIGURED');
  });

  it('500 with a generic message on DB failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    srepo.failWith = new Error('db exploded');
    const body = await expectError(await getMe(req('/me', 'GET', undefined, AUTH)), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('exploded');
  });
});

describe('create / me', () => {
  it('GET /me is null before joining; create returns 201 with the leader view', async () => {
    let res = await getMe(req('/me', 'GET', undefined, AUTH));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ squad: null });

    res = await create(req('', 'POST', { name: '  Night  Shift ', tag: '#night', icon: 'flame' }));
    expect(res.status).toBe(201);
    const { squad } = (await res.json()) as MySquadResponse;
    expect(squad).toMatchObject({ name: 'Night Shift', tag: 'NIGHT', icon: 'flame', isLeader: true, memberCount: 1, maxMembers: 5 });
    expect(squad?.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(squad?.members[0]).toMatchObject({ profileId: PROFILE_ID, role: 'LEADER', isYou: true, weeklyAura: 300 });
    expect(squad?.progress).toMatchObject({ aura: 300, goal: 5000, goalIsCustom: false, percent: 6 });
  });

  it('validation, already-in-squad, taken name / tag', async () => {
    let err = await expectError(await create(req('', 'POST', { name: 'ab', tag: 'x', icon: 'rocket' })), 400, 'VALIDATION_FAILED');
    expect(Object.keys(err.fieldErrors).sort()).toEqual(['icon', 'name', 'tag']);
    srepo.seedSquad(OTHER, [], { name: 'Taken', tag: 'TAKEN' });
    err = await expectError(await create(req('', 'POST', { name: 'taken', tag: 'NEW', icon: 'zap' })), 409, 'SQUAD_NAME_TAKEN');
    expect(err.fieldErrors).toHaveProperty('name');
    await expectError(await create(req('', 'POST', { name: 'Fresh', tag: 'TAKEN', icon: 'zap' })), 409, 'SQUAD_TAG_TAKEN');
    expect((await create(req('', 'POST', { name: 'Fresh', tag: 'NEW', icon: 'zap' }))).status).toBe(201);
    await expectError(await create(req('', 'POST', { name: 'Second', tag: 'TWO', icon: 'zap' })), 409, 'ALREADY_IN_SQUAD');
    squadActionLimiter.reset();
    await expectError(await create(req('', 'POST', 'not json')), 400, 'BAD_REQUEST');
    await expectError(await create(req('', 'POST', { name: 'x' }, { ...AUTH, 'content-type': 'text/plain' })), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('member view hides the invite code', async () => {
    srepo.seedSquad(OTHER, [PROFILE_ID]);
    const { squad } = (await (await getMe(req('/me', 'GET', undefined, AUTH))).json()) as MySquadResponse;
    expect(squad).toMatchObject({ isLeader: false, inviteCode: null, memberCount: 2 });
    expect(squad?.members.map((m) => [m.handle, m.role])).toEqual([
      ['@other', 'LEADER'],
      ['@jinwoo', 'MEMBER'],
    ]);
  });

  it('rate limits create/join (squad action limiter)', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 7; i++) last = await join(req('/join', 'POST', { code: 'ZZZZZZZZ' }));
    await expectError(last!, 429, 'RATE_LIMITED');
    expect(last!.headers.get('retry-after')).toMatch(/^\d+$/);
  });
});

describe('join / leave', () => {
  it('joins with a normalised code; errors for invalid, full and already-in-squad', async () => {
    const s = srepo.seedSquad(OTHER);
    await expectError(await join(req('/join', 'POST', { code: 'nope' })), 400, 'VALIDATION_FAILED');
    await expectError(await join(req('/join', 'POST', { code: 'ZZZZZZZZ' })), 404, 'INVALID_INVITE_CODE');
    const res = await join(req('/join', 'POST', { code: ` ${s.inviteCode.toLowerCase().slice(0, 4)}-${s.inviteCode.slice(4)} ` }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as MySquadResponse).squad?.memberCount).toBe(2);
    await expectError(await join(req('/join', 'POST', { code: s.inviteCode })), 409, 'ALREADY_IN_SQUAD');
  });

  it('SQUAD_FULL at 5 members', async () => {
    const ids = ['c', 'd', 'e', 'f'].map((x) => `cccccccc-cccc-4ccc-8ccc-cccccccccc0${x}`);
    ids.forEach((id, i) => srepo.addProfile(id, `@p${i}`));
    const s = srepo.seedSquad(OTHER, ids);
    await expectError(await join(req('/join', 'POST', { code: s.inviteCode })), 409, 'SQUAD_FULL');
  });

  it('leave: 404 when not in a squad; leader hands over; last member deletes', async () => {
    await expectError(await leave(req('/leave', 'POST', undefined, AUTH)), 404, 'NOT_IN_SQUAD');
    const s = srepo.seedSquad(PROFILE_ID, [OTHER]);
    let res = await leave(req('/leave', 'POST', undefined, AUTH));
    expect(await res.json()).toEqual({ squad: null, squadDeleted: false });
    expect(srepo.squads.get(s.id)?.leaderId).toBe(OTHER);
    srepo.seedSquad(PROFILE_ID);
    res = await leave(req('/leave', 'POST', undefined, AUTH));
    expect(await res.json()).toEqual({ squad: null, squadDeleted: true });
  });
});

describe('leader actions', () => {
  it('regenerate invite code: leader only', async () => {
    await expectError(await regenerate(req('/me/invite-code', 'POST', undefined, AUTH)), 404, 'NOT_IN_SQUAD');
    srepo.seedSquad(OTHER, [PROFILE_ID]);
    await expectError(await regenerate(req('/me/invite-code', 'POST', undefined, AUTH)), 403, 'NOT_SQUAD_LEADER');
    srepo = new FakeSquadRepo();
    srepo.addProfile(PROFILE_ID, '@jinwoo');
    h.srepo = srepo;
    const s = srepo.seedSquad(PROFILE_ID);
    const old = s.inviteCode;
    const res = await regenerate(req('/me/invite-code', 'POST', undefined, AUTH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inviteCode).not.toBe(old);
    expect(body.inviteCode).toBe(srepo.squads.get(s.id)?.inviteCode);
  });

  it('PATCH: validation, leader only, applies goal / name / icon', async () => {
    srepo.seedSquad(OTHER, [PROFILE_ID]);
    await expectError(await patchMe(req('/me', 'PATCH', { weeklyGoal: 12000 })), 403, 'NOT_SQUAD_LEADER');
    srepo.seedSquad(THIRD, [], { name: 'Taken' });
    srepo.profiles.get(PROFILE_ID)!.squadId = null;
    const mine = srepo.seedSquad(PROFILE_ID);
    await expectError(await patchMe(req('/me', 'PATCH', { weeklyGoal: 500 })), 400, 'VALIDATION_FAILED');
    await expectError(await patchMe(req('/me', 'PATCH', {})), 400, 'VALIDATION_FAILED');
    await expectError(await patchMe(req('/me', 'PATCH', { name: 'TAKEN' })), 409, 'SQUAD_NAME_TAKEN');
    const res = await patchMe(req('/me', 'PATCH', { weeklyGoal: 12000, name: 'Dawn Patrol', icon: 'crown' }));
    expect(res.status).toBe(200);
    const { squad } = (await res.json()) as MySquadResponse;
    expect(squad).toMatchObject({ id: mine.id, name: 'Dawn Patrol', icon: 'crown', weeklyGoal: 12000 });
    expect(squad?.progress).toMatchObject({ goal: 12000, goalIsCustom: true });
    const reset = (await (await patchMe(req('/me', 'PATCH', { weeklyGoal: null }))).json()) as MySquadResponse;
    expect(reset.squad?.progress.goalIsCustom).toBe(false);
  });

  it('remove member: leader only, never self, member must be in the squad', async () => {
    srepo.seedSquad(PROFILE_ID, [OTHER]);
    await expectError(await removeMember(req(`/me/members/${PROFILE_ID}`, 'DELETE', undefined, AUTH), params(PROFILE_ID)), 400, 'CANNOT_REMOVE_SELF');
    await expectError(await removeMember(req('/me/members/x', 'DELETE', undefined, AUTH), params('not-a-uuid')), 404, 'MEMBER_NOT_FOUND');
    await expectError(await removeMember(req(`/me/members/${THIRD}`, 'DELETE', undefined, AUTH), params(THIRD)), 404, 'MEMBER_NOT_FOUND');
    const res = await removeMember(req(`/me/members/${OTHER}`, 'DELETE', undefined, AUTH), params(OTHER));
    expect(res.status).toBe(200);
    expect(((await res.json()) as MySquadResponse).squad?.memberCount).toBe(1);
    expect(srepo.profiles.get(OTHER)?.squadId).toBeNull();
  });

  it('a non-leader cannot remove', async () => {
    srepo.seedSquad(OTHER, [PROFILE_ID, THIRD]);
    await expectError(await removeMember(req(`/me/members/${THIRD}`, 'DELETE', undefined, AUTH), params(THIRD)), 403, 'NOT_SQUAD_LEADER');
  });
});

describe('leaderboard + activity', () => {
  it('leaderboard is public, cacheable and has no member details', async () => {
    srepo.seedSquad(PROFILE_ID, [], { name: 'Low', tag: 'LOW' });
    srepo.seedSquad(OTHER, [], { name: 'High', tag: 'HIGH' });
    const res = await leaderboard();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage=30');
    const body = (await res.json()) as SquadLeaderboardResponse;
    expect(body.squads.map((s) => [s.rank, s.tag, s.weeklyAura])).toEqual([
      [1, 'HIGH', 900],
      [2, 'LOW', 300],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/@jinwoo|@other|inviteCode|leader/);
  });

  it('activity: members only; marks your own entries', async () => {
    await expectError(await activity(req('/me/activity', 'GET', undefined, AUTH)), 404, 'NOT_IN_SQUAD');
    srepo.seedSquad(PROFILE_ID, [OTHER]);
    srepo.activityItems = [
      { id: 'a1', kind: 'WORKOUT', profileId: OTHER, title: 'Burner', aura: 180, completedAt: '2026-10-14T07:00:00.000Z' },
      { id: 'a2', kind: 'QUEST', profileId: PROFILE_ID, title: 'Pushups', aura: 250, completedAt: '2026-10-13T07:00:00.000Z' },
      { id: 'a3', kind: 'QUEST', profileId: THIRD, title: 'Outsider', aura: 5, completedAt: '2026-10-13T07:00:00.000Z' },
    ];
    const body = (await (await activity(req('/me/activity', 'GET', undefined, AUTH))).json()) as SquadActivityResponse;
    expect(body.items.map((i) => [i.id, i.handle, i.isYou])).toEqual([
      ['a1', '@other', false],
      ['a2', '@jinwoo', true],
    ]);
  });
});
