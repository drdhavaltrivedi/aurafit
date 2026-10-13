import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateAuraGain,
  INITIAL_QUESTS,
  INITIAL_WORKOUT_DROPS,
  utcDateKey,
  type CompleteQuestResponse,
  type CompleteWorkoutResponse,
  type CreateDropResponse,
  type LeaderboardResponse,
  type MeResponse,
} from '@aurafit/shared';
import { AUTH_ID, FakeRepo, makeProfileRow, PROFILE_ID } from '@/test/fake-repo';

const h = vi.hoisted(() => ({ configured: true, repo: null as unknown }));

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

import { mutationLimiter } from '@/lib/api/rate-limit';
import { GET as getMe } from './me/route';
import { POST as completeQuest } from './quests/[questId]/complete/route';
import { POST as completeWorkout } from './workouts/[dropId]/complete/route';
import { GET as listDrops, POST as createDrop } from './drops/route';
import { GET as leaderboard } from './leaderboard/route';

const AUTH: Record<string, string> = { authorization: 'Bearer good.token.sig' };
const BASE = 'http://localhost/api/v1';
let repo: FakeRepo;

const post = (path: string, headers: Record<string, string> = AUTH, body?: string) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers, body });
const get = (path: string, headers: Record<string, string> = AUTH) => new Request(`${BASE}${path}`, { headers });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = await res.json();
  expect(body).toMatchObject({ code, error: expect.any(String) });
  return body;
}

beforeEach(() => {
  h.configured = true;
  repo = new FakeRepo();
  h.repo = repo;
  mutationLimiter.reset();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /api/v1/me', () => {
  it('401 without credentials', async () => {
    await expectError(await getMe(get('/me', {})), 401, 'UNAUTHORIZED');
  });

  it('without Supabase env: 401 for anonymous callers, 503 for bearer callers', async () => {
    h.configured = false;
    await expectError(await getMe(get('/me', {})), 401, 'UNAUTHORIZED');
    await expectError(await getMe(get('/me')), 503, 'NOT_CONFIGURED');
  });

  it('returns the camelCase profile (rank derived) and quests with today completion flags', async () => {
    repo.questLog.add(`${PROFILE_ID}|q_daily_2|${utcDateKey()}`);
    repo.questLog.add(`${PROFILE_ID}|q_daily_1|2000-01-01`); // another day: not completed today
    const res = await getMe(get('/me'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as MeResponse;
    expect(body.profile).toEqual({
      id: PROFILE_ID,
      username: 'Jinwoo',
      handle: '@jinwoo',
      role: 'MEMBER',
      avatarUrl: '',
      title: 'Hunter in Training',
      bio: '',
      auraPoints: 950,
      rank: 'E-RANK',
      level: 1,
      attributes: { str: 50, agi: 50, end: 50, rec: 50 },
      streakDays: 4,
      streakShields: 2,
      totalWorkouts: 0,
      weeklyAuraGained: 0,
    });
    expect(JSON.stringify(body)).not.toContain('auth_id');
    expect(body.quests).toHaveLength(INITIAL_QUESTS.length);
    const byId = Object.fromEntries(body.quests.map((q) => [q.id, q]));
    expect(byId.q_daily_2).toMatchObject({ completed: true, progress: 100, currentCount: 12 });
    expect(byId.q_daily_1).toMatchObject({ completed: false, progress: 0, currentCount: 0, statReward: { stat: 'str', amount: 3 } });
  });

  it('500 with a generic message when the data layer fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(repo, 'listQuests').mockRejectedValue(new Error('db exploded'));
    const body = await expectError(await getMe(get('/me')), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('exploded');
  });
});

describe('POST /api/v1/quests/{questId}/complete', () => {
  const call = (id: string, headers = AUTH) => completeQuest(post(`/quests/${id}/complete`, headers), params({ questId: id }));

  it('200: completes with aura from calculateAuraGain(reward, streak) and returns the new profile', async () => {
    const res = await call('q_daily_1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as CompleteQuestResponse;
    const expected = calculateAuraGain(250, 4);
    expect(body).toMatchObject({ status: 'completed', auraEarned: expected, statGain: { stat: 'str', amount: 3 } });
    expect(body.profile.auraPoints).toBe(950 + expected);
    expect(body.profile.rank).toBe('D-RANK');
    expect(repo.calls.completeQuest[0]).toEqual({ userId: PROFILE_ID, itemId: 'q_daily_1', aura: expected, dateKey: utcDateKey() });
  });

  it('409 ALREADY_COMPLETED on the second completion the same day', async () => {
    expect((await call('q_daily_1')).status).toBe(200);
    await expectError(await call('q_daily_1'), 409, 'ALREADY_COMPLETED');
  });

  it('404 for unknown or malformed quest ids', async () => {
    await expectError(await call('q_nope'), 404, 'NOT_FOUND');
    await expectError(await call('../../etc'), 404, 'NOT_FOUND');
    expect(repo.calls.completeQuest).toHaveLength(0);
  });

  it('401 for missing or invalid tokens', async () => {
    await expectError(await call('q_daily_1', {}), 401, 'UNAUTHORIZED');
    await expectError(await call('q_daily_1', { authorization: 'Bearer forged.token.sig' }), 401, 'UNAUTHORIZED');
  });

  it('403 when the role lacks DO_QUESTS', async () => {
    repo.profile = makeProfileRow({ role: 'GHOST' as never });
    await expectError(await call('q_daily_1'), 403, 'FORBIDDEN');
    expect(repo.calls.completeQuest).toHaveLength(0);
  });

  it('caps the aura passed to the database at MAX_AURA_PER_SYNC', async () => {
    repo.profile = makeProfileRow({ streak_days: 999 });
    await call('q_boss_1');
    expect(repo.calls.completeQuest[0].aura).toBe(calculateAuraGain(1500, 999));
    expect(repo.calls.completeQuest[0].aura).toBeLessThanOrEqual(5000);
  });

  it('429 after the per-user burst', async () => {
    for (let i = 0; i < 10; i++) await call('q_daily_1');
    const res = await call('q_daily_1');
    await expectError(res, 429, 'RATE_LIMITED');
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/v1/workouts/{dropId}/complete', () => {
  const drop = INITIAL_WORKOUT_DROPS[0];
  const call = (id: string, headers = AUTH) => completeWorkout(post(`/workouts/${id}/complete`, headers), params({ dropId: id }));

  it('200 with aura = calculateAuraGain(xpPoints, streak, auraMultiplier)', async () => {
    const res = await call(drop.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as CompleteWorkoutResponse;
    const expected = calculateAuraGain(drop.xpPoints, 4, drop.auraMultiplier);
    expect(body).toEqual({ status: 'completed', auraEarned: expected, profile: expect.objectContaining({ auraPoints: 950 + expected }) });
  });

  it('409 when repeated the same day, 404 for unknown drops, 401 without auth', async () => {
    await call(drop.id);
    await expectError(await call(drop.id), 409, 'ALREADY_COMPLETED');
    await expectError(await call('drop_missing'), 404, 'NOT_FOUND');
    await expectError(await call(drop.id, {}), 401, 'UNAUTHORIZED');
  });
});

describe('/api/v1/drops', () => {
  const body = { title: 'Core Reset', vibe: 'HARDSTYLE', category: 'STRENGTH', duration: 20, multiplier: 2 };
  const send = (payload: unknown, headers: Record<string, string> = { ...AUTH, 'content-type': 'application/json' }) =>
    createDrop(post('/drops', headers, typeof payload === 'string' ? payload : JSON.stringify(payload)));

  it('GET lists drops publicly (no auth needed)', async () => {
    const res = await listDrops();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as unknown[]).length).toBe(INITIAL_WORKOUT_DROPS.length);
  });

  it('GET 503 when not configured', async () => {
    h.repo = null;
    await expectError(await listDrops(), 503, 'NOT_CONFIGURED');
  });

  it('POST 403 for members (PUBLISH_WORKOUT_DROP)', async () => {
    await expectError(await send(body), 403, 'FORBIDDEN');
  });

  it('POST 201 for creators; server derives creator + counters', async () => {
    repo.profile = makeProfileRow({ role: 'CREATOR', avatar_url: 'https://images.unsplash.com/x' });
    const res = await send(body);
    expect(res.status).toBe(201);
    const { drop } = (await res.json()) as CreateDropResponse;
    expect(drop).toMatchObject({
      title: 'Core Reset',
      creatorId: PROFILE_ID,
      creatorHandle: '@jinwoo',
      creatorAvatar: 'https://images.unsplash.com/x',
      xpPoints: 500,
      likesCount: 0,
      completionsCount: 0,
    });
    expect(drop.id).toMatch(/^drop_[A-Za-z0-9_-]+$/);
  });

  it('POST 400 VALIDATION_FAILED with field errors', async () => {
    repo.profile = makeProfileRow({ role: 'ADMIN' });
    const res = await send({ ...body, title: 'x', duration: 999, likesCount: 1e9 });
    const err = await expectError(res, 400, 'VALIDATION_FAILED');
    expect(err.details.length).toBeGreaterThan(0);
    const res2 = await send({ ...body, title: 'x', duration: 999 });
    const err2 = await expectError(res2, 400, 'VALIDATION_FAILED');
    expect(Object.keys(err2.fieldErrors).sort()).toEqual(['duration', 'title']);
  });

  it('POST 415 / 400 / 413 for bad bodies', async () => {
    repo.profile = makeProfileRow({ role: 'CREATOR' });
    await expectError(await send(body, { ...AUTH, 'content-type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    await expectError(await send('{nope'), 400, 'BAD_REQUEST');
    await expectError(await send({ ...body, title: 'x'.repeat(10_000) }), 413, 'PAYLOAD_TOO_LARGE');
  });

  it('POST 401 without auth', async () => {
    await expectError(await send(body, { 'content-type': 'application/json' }), 401, 'UNAUTHORIZED');
  });
});

describe('GET /api/v1/leaderboard', () => {
  it('returns public hunter fields and squads', async () => {
    const res = await leaderboard();
    expect(res.status).toBe(200);
    const body = (await res.json()) as LeaderboardResponse;
    expect(body.squads).toEqual([]);
    expect(Object.keys(body.hunters[0]).sort()).toEqual(
      ['auraPoints', 'avatarUrl', 'handle', 'id', 'level', 'rank', 'role', 'streakDays', 'totalWorkouts', 'username'].sort(),
    );
  });

  it('503 when not configured', async () => {
    h.repo = null;
    await expectError(await leaderboard(), 503, 'NOT_CONFIGURED');
  });
});
