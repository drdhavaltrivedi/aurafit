/** Route tests for creator tools: /api/v1/creator/**, /api/v1/drops/{id}, /api/v1/creators/**, /api/v1/me/following. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asCreatorDrop,
  INITIAL_WORKOUT_DROPS,
  type CreatorAnalyticsResponse,
  type CreatorDropResponse,
  type CreatorDropsResponse,
  type CreatorProfileResponse,
  type DropEditorInput,
  type FollowingResponse,
  type FollowResponse,
  type WorkoutDrop,
} from '@aurafit/shared';
import { AUTH_ID, FakeRepo, makeProfileRow, PROFILE_ID } from '@/test/fake-repo';
import { FakeCreatorRepo } from '@/test/fake-creator-repo';

const h = vi.hoisted(() => ({ configured: true, repo: null as unknown, crepo: null as unknown }));

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
vi.mock('@/lib/creator', () => ({ getCreatorRepository: () => h.crepo }));

import { mutationLimiter } from '@/lib/api/rate-limit';
import { analyticsLimiter, followLimiter } from '@/lib/creator/http';
import { GET as listMine, POST as createDrop } from './drops/route';
import { GET as analytics } from './analytics/route';
import { DELETE as deleteDrop, PATCH as patchDrop } from '../drops/[dropId]/route';
import { GET as creatorProfile } from '../creators/[handle]/route';
import { DELETE as unfollow, POST as follow } from '../creators/[handle]/follow/route';
import { GET as following } from '../me/following/route';

const BASE = 'http://localhost/api/v1';
const AUTH = { authorization: 'Bearer good.token.sig' };
const JSON_AUTH = { ...AUTH, 'content-type': 'application/json' };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SYSTEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** FakeRepo whose public listing honours the creator filter (like the Supabase repository). */
class ListingRepo extends FakeRepo {
  override async listDrops(opts: { creatorId?: string } = {}): Promise<WorkoutDrop[]> {
    return this.drops.filter((d) => !opts.creatorId || d.creatorId === opts.creatorId);
  }
}

let repo: ListingRepo;
let crepo: FakeCreatorRepo;

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = JSON_AUTH) =>
  new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const dropParams = (dropId: string) => ({ params: Promise.resolve({ dropId }) });
const handleParams = (handle: string) => ({ params: Promise.resolve({ handle }) });

const editor = (over: Partial<DropEditorInput> = {}): DropEditorInput => ({
  title: 'Core Reset',
  tagline: 'Ten minutes of core',
  vibeTag: 'LO-FI GLOW',
  category: 'STRENGTH',
  difficulty: 'HUNTER',
  durationMinutes: 10,
  caloriesBurnEstimate: 80,
  auraMultiplier: 1.5,
  coverGradient: ['#7C3AED', '#3B82F6'],
  exercises: [
    { name: 'Dead Bugs', targetMuscle: 'Core', repsOrSeconds: '3 x 10', tips: 'Slow' },
    { name: 'Side Plank', targetMuscle: 'Obliques', repsOrSeconds: '30s', tips: '' },
  ],
  ...over,
});

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(body).toMatchObject({ code, error: expect.any(String) });
  expect(res.headers.get('cache-control')).toBe('no-store');
  return body;
}

beforeEach(() => {
  h.configured = true;
  repo = new ListingRepo(makeProfileRow({ role: 'CREATOR', handle: '@jinwoo' }));
  crepo = new FakeCreatorRepo();
  crepo.addCreator({ id: PROFILE_ID, handle: '@jinwoo', username: 'Jinwoo' });
  crepo.addCreator({ id: OTHER, handle: '@thornegym', username: 'Alex Thorne' });
  crepo.addCreator({ id: SYSTEM, handle: '@aurafit', username: 'AuraFit Coach', official: true });
  h.repo = repo;
  h.crepo = crepo;
  mutationLimiter.reset();
  analyticsLimiter.reset();
  followLimiter.reset();
});
afterEach(() => vi.restoreAllMocks());

describe('auth, permissions, config', () => {
  it('401 without credentials; 403 for members; 503 without a creator repository', async () => {
    await expectError(await listMine(req('/creator/drops', 'GET', undefined, {})), 401, 'UNAUTHORIZED');
    await expectError(await analytics(req('/creator/analytics', 'GET', undefined, {})), 401, 'UNAUTHORIZED');
    await expectError(await following(req('/me/following', 'GET', undefined, {})), 401, 'UNAUTHORIZED');
    await expectError(await follow(req('/creators/thornegym/follow', 'POST', undefined, {}), handleParams('thornegym')), 401, 'UNAUTHORIZED');

    repo.profile = makeProfileRow({ role: 'MEMBER' });
    await expectError(await listMine(req('/creator/drops', 'GET', undefined, AUTH)), 403, 'FORBIDDEN');
    await expectError(await createDrop(req('/creator/drops', 'POST', editor())), 403, 'FORBIDDEN');
    await expectError(await analytics(req('/creator/analytics', 'GET', undefined, AUTH)), 403, 'FORBIDDEN');
    await expectError(await patchDrop(req('/drops/drop_x', 'PATCH', editor()), dropParams('drop_x')), 403, 'FORBIDDEN');

    h.crepo = null;
    await expectError(await listMine(req('/creator/drops', 'GET', undefined, AUTH)), 503, 'NOT_CONFIGURED');
    await expectError(await creatorProfile(req('/creators/thornegym', 'GET', undefined, {}), handleParams('thornegym')), 503, 'NOT_CONFIGURED');
  });
});

describe('POST/GET /api/v1/creator/drops', () => {
  it('creates a full drop (server-derived XP and exercise ids) and lists it', async () => {
    const res = await createDrop(req('/creator/drops', 'POST', editor({ title: '  Core   Reset  ', vibeTag: 'lo-fi glow' })));
    expect(res.status).toBe(201);
    const { drop } = (await res.json()) as CreatorDropResponse;
    expect(drop).toMatchObject({ title: 'Core Reset', vibeTag: 'LO-FI GLOW', status: 'LIVE', publishAt: null, creatorId: PROFILE_ID, xpPoints: 170 });
    expect(drop.exercises.map((e) => e.id)).toEqual([`${drop.id}_ex1`, `${drop.id}_ex2`]);
    expect(drop.id).toMatch(/^drop_/);

    const list = (await (await listMine(req('/creator/drops', 'GET', undefined, AUTH))).json()) as CreatorDropsResponse;
    expect(list.drops.map((d) => d.id)).toEqual([drop.id]);
  });

  it('schedules a drop and rejects invalid bodies with field errors', async () => {
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const res = await createDrop(req('/creator/drops', 'POST', editor({ publishAt: at })));
    expect(res.status).toBe(201);
    expect(((await res.json()) as CreatorDropResponse).drop).toMatchObject({ status: 'SCHEDULED', publishAt: at });

    const bad = await expectError(
      await createDrop(req('/creator/drops', 'POST', editor({ exercises: [], auraMultiplier: 9, coverGradient: ['#000000', '#111111'] }))),
      400,
      'VALIDATION_FAILED',
    );
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(['auraMultiplier', 'coverGradient', 'exercises']);
    await expectError(
      await createDrop(req('/creator/drops', 'POST', editor({ publishAt: new Date(Date.now() + 61 * 86_400_000).toISOString() }))),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(await createDrop(req('/creator/drops', 'POST', '{nope')), 400, 'BAD_REQUEST');
    await expectError(await createDrop(req('/creator/drops', 'POST', editor(), AUTH)), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rate limits creation', async () => {
    for (let i = 0; i < 10; i++) expect((await createDrop(req('/creator/drops', 'POST', editor()))).status).toBe(201);
    const res = await createDrop(req('/creator/drops', 'POST', editor()));
    await expectError(res, 429, 'RATE_LIMITED');
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('PATCH/DELETE /api/v1/drops/{id}', () => {
  async function mine(over: Partial<DropEditorInput> = {}) {
    const res = await createDrop(req('/creator/drops', 'POST', editor(over)));
    return ((await res.json()) as CreatorDropResponse).drop;
  }

  it('edits own drop and keeps counters', async () => {
    const drop = await mine();
    crepo.drops[0] = { ...crepo.drops[0], likesCount: 12, completionsCount: 34 };
    const res = await patchDrop(req(`/drops/${drop.id}`, 'PATCH', editor({ title: 'Core Reset v2', durationMinutes: 20 })), dropParams(drop.id));
    expect(res.status).toBe(200);
    const { drop: updated } = (await res.json()) as CreatorDropResponse;
    expect(updated).toMatchObject({ id: drop.id, title: 'Core Reset v2', durationMinutes: 20, likesCount: 12, completionsCount: 34, status: 'LIVE' });
  });

  it('owner-only; af_* system drops are never editable; unknown ids 404', async () => {
    crepo.addDrop(asCreatorDrop({ ...INITIAL_WORKOUT_DROPS[0], id: 'drop_theirs', creatorId: OTHER }));
    await expectError(await patchDrop(req('/drops/drop_theirs', 'PATCH', editor()), dropParams('drop_theirs')), 403, 'NOT_DROP_OWNER');
    await expectError(await deleteDrop(req('/drops/drop_theirs', 'DELETE', undefined, AUTH), dropParams('drop_theirs')), 403, 'NOT_DROP_OWNER');
    await expectError(
      await patchDrop(req('/drops/af_core_armor_10', 'PATCH', editor()), dropParams('af_core_armor_10')),
      403,
      'NOT_DROP_OWNER',
    );
    await expectError(await deleteDrop(req('/drops/af_core_armor_10', 'DELETE', undefined, AUTH), dropParams('af_core_armor_10')), 403, 'NOT_DROP_OWNER');
    await expectError(await patchDrop(req('/drops/drop_missing', 'PATCH', editor()), dropParams('drop_missing')), 404, 'NOT_FOUND');
    await expectError(await deleteDrop(req('/drops/bad%20id', 'DELETE', undefined, AUTH), dropParams('bad id')), 404, 'NOT_FOUND');
    expect(crepo.drops.find((d) => d.id === 'drop_theirs')).toBeTruthy();
    expect(crepo.calls).not.toContain('updateDrop');
  });

  it('publishAt: reschedule a scheduled drop, publish it now with null, 409 for live drops', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const later = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const drop = await mine({ publishAt: soon });
    let res = await patchDrop(req(`/drops/${drop.id}`, 'PATCH', editor({ publishAt: later })), dropParams(drop.id));
    expect(((await res.json()) as CreatorDropResponse).drop).toMatchObject({ status: 'SCHEDULED', publishAt: later });
    // Omitted = unchanged.
    res = await patchDrop(req(`/drops/${drop.id}`, 'PATCH', { ...editor(), publishAt: undefined }), dropParams(drop.id));
    expect(((await res.json()) as CreatorDropResponse).drop.publishAt).toBe(later);
    res = await patchDrop(req(`/drops/${drop.id}`, 'PATCH', editor({ publishAt: null })), dropParams(drop.id));
    expect(((await res.json()) as CreatorDropResponse).drop).toMatchObject({ status: 'LIVE', publishAt: null });
    await expectError(await patchDrop(req(`/drops/${drop.id}`, 'PATCH', editor({ publishAt: later })), dropParams(drop.id)), 409, 'ALREADY_LIVE');
  });

  it('deletes own drop (204), also after a demotion to MEMBER', async () => {
    const drop = await mine();
    repo.profile = makeProfileRow({ role: 'MEMBER' });
    const res = await deleteDrop(req(`/drops/${drop.id}`, 'DELETE', undefined, AUTH), dropParams(drop.id));
    expect(res.status).toBe(204);
    expect(crepo.drops).toHaveLength(0);
    await expectError(await deleteDrop(req(`/drops/${drop.id}`, 'DELETE', undefined, AUTH), dropParams(drop.id)), 404, 'NOT_FOUND');
  });
});

describe('GET /api/v1/creator/analytics', () => {
  it('returns aggregates for 7d by default and 30d on request; rejects other ranges', async () => {
    const week = (await (await analytics(req('/creator/analytics', 'GET', undefined, AUTH))).json()) as CreatorAnalyticsResponse;
    expect(week.range).toBe('7d');
    expect(week.series).toHaveLength(7);
    const month = (await (await analytics(req('/creator/analytics?range=30d', 'GET', undefined, AUTH))).json()) as CreatorAnalyticsResponse;
    expect(month.range).toBe('30d');
    expect(crepo.analyticsCalls).toEqual([
      { creatorId: PROFILE_ID, days: 7 },
      { creatorId: PROFILE_ID, days: 30 },
    ]);
    await expectError(await analytics(req('/creator/analytics?range=1y', 'GET', undefined, AUTH)), 400, 'VALIDATION_FAILED');
  });

  it('500 on repository failure without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    crepo.failWith = new Error('db down: secret');
    const body = await expectError(await analytics(req('/creator/analytics', 'GET', undefined, AUTH)), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

describe('creators + follows', () => {
  beforeEach(() => {
    repo.drops = [
      { ...INITIAL_WORKOUT_DROPS[0], creatorId: OTHER, likesCount: 5, completionsCount: 7 },
      { ...INITIAL_WORKOUT_DROPS[1], creatorId: OTHER, likesCount: 1, completionsCount: 3 },
      { ...INITIAL_WORKOUT_DROPS[2], creatorId: SYSTEM },
    ];
  });

  it('public profile: totals from live drops; isFollowing null when signed out', async () => {
    const res = await creatorProfile(req('/creators/thornegym', 'GET', undefined, {}), handleParams('thornegym'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CreatorProfileResponse;
    expect(body.creator).toMatchObject({ handle: '@thornegym', followerCount: 0, liveDropCount: 2, totalCompletions: 10, totalLikes: 6 });
    expect(body.drops).toHaveLength(2);
    expect(body.isFollowing).toBeNull();
    expect(JSON.stringify(body)).not.toContain('auth_id');
    // "@handle" form and unknown handles.
    expect((await creatorProfile(req('/creators/%40thornegym', 'GET', undefined, {}), handleParams('%40thornegym'))).status).toBe(200);
    await expectError(await creatorProfile(req('/creators/nobody', 'GET', undefined, {}), handleParams('nobody')), 404, 'CREATOR_NOT_FOUND');
    await expectError(await creatorProfile(req('/creators/x', 'GET', undefined, {}), handleParams('%E0%A4%A')), 404, 'CREATOR_NOT_FOUND');
  });

  it('follow / unfollow are idempotent; counts update; following list; self-follow rejected', async () => {
    let res = await follow(req('/creators/thornegym/follow', 'POST', undefined, AUTH), handleParams('thornegym'));
    expect((await res.json()) as FollowResponse).toEqual({ following: true, followerCount: 1 });
    res = await follow(req('/creators/thornegym/follow', 'POST', undefined, AUTH), handleParams('thornegym'));
    expect((await res.json()) as FollowResponse).toEqual({ following: true, followerCount: 1 });
    await follow(req('/creators/aurafit/follow', 'POST', undefined, AUTH), handleParams('aurafit'));

    const signedIn = (await (await creatorProfile(req('/creators/thornegym', 'GET', undefined, AUTH), handleParams('thornegym'))).json()) as CreatorProfileResponse;
    expect(signedIn).toMatchObject({ isFollowing: true, isSelf: false });
    expect(signedIn.creator.followerCount).toBe(1);

    const list = (await (await following(req('/me/following', 'GET', undefined, AUTH))).json()) as FollowingResponse;
    expect(list.creators.map((c) => c.handle)).toEqual(['@aurafit', '@thornegym']);
    expect(list.creators[0]).toMatchObject({ official: true, followedAt: expect.any(String) });

    res = await unfollow(req('/creators/thornegym/follow', 'DELETE', undefined, AUTH), handleParams('thornegym'));
    expect((await res.json()) as FollowResponse).toEqual({ following: false, followerCount: 0 });
    res = await unfollow(req('/creators/thornegym/follow', 'DELETE', undefined, AUTH), handleParams('thornegym'));
    expect((await res.json()) as FollowResponse).toEqual({ following: false, followerCount: 0 });

    await expectError(await follow(req('/creators/jinwoo/follow', 'POST', undefined, AUTH), handleParams('jinwoo')), 400, 'CANNOT_FOLLOW_SELF');
    await expectError(await follow(req('/creators/nobody/follow', 'POST', undefined, AUTH), handleParams('nobody')), 404, 'CREATOR_NOT_FOUND');
    const self = (await (await creatorProfile(req('/creators/jinwoo', 'GET', undefined, AUTH), handleParams('jinwoo'))).json()) as CreatorProfileResponse;
    expect(self).toMatchObject({ isSelf: true, isFollowing: false });
  });
});
