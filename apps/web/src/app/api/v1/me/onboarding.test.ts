/** Route tests for PATCH /api/v1/me (onboarding) and the onboarding fields on GET /api/v1/me. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse, UpdateMeResponse } from '@aurafit/shared';
import { AUTH_ID, FakeRepo, makeProfileRow, PROFILE_ID } from '@/test/fake-repo';

const h = vi.hoisted(() => ({ configured: true, repo: null as unknown, cookieSub: null as string | null }));

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
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: h.cookieSub ? { claims: { sub: h.cookieSub } } : null, error: null }) },
  }),
}));
vi.mock('@/lib/data', () => ({ getRepository: () => h.repo }));

import { mutationLimiter } from '@/lib/api/rate-limit';
import { GET as getMe, PATCH as patchMe } from './route';

const URL_ME = 'http://localhost/api/v1/me';
const JSON_AUTH = { authorization: 'Bearer good.token.sig', 'content-type': 'application/json' };
let repo: FakeRepo;

const patch = (body: unknown, headers: Record<string, string> = JSON_AUTH) =>
  patchMe(new Request(URL_ME, { method: 'PATCH', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }));

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = await res.json();
  expect(body).toMatchObject({ code, error: expect.any(String) });
  return body;
}

beforeEach(() => {
  h.configured = true;
  h.cookieSub = null;
  repo = new FakeRepo(makeProfileRow({ onboarded_at: null }));
  h.repo = repo;
  mutationLimiter.reset();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /api/v1/me onboarding fields', () => {
  it('a new user is not onboarded and has no goal/level', async () => {
    const body = (await (await getMe(new Request(URL_ME, { headers: { authorization: 'Bearer good.token.sig' } }))).json()) as MeResponse;
    expect(body.profile).toMatchObject({ onboarded: false, fitnessGoal: null, fitnessLevel: null });
  });

  it('reflects stored answers', async () => {
    repo.profile = makeProfileRow({ fitness_goal: 'MOBILITY', fitness_level: 'ADVANCED' });
    const body = (await (await getMe(new Request(URL_ME, { headers: { authorization: 'Bearer good.token.sig' } }))).json()) as MeResponse;
    expect(body.profile).toMatchObject({ onboarded: true, fitnessGoal: 'MOBILITY', fitnessLevel: 'ADVANCED' });
  });
});

describe('PATCH /api/v1/me', () => {
  it('401 without credentials or with a forged token', async () => {
    await expectError(await patch({ fitnessGoal: 'GET_FIT' }, { 'content-type': 'application/json' }), 401, 'UNAUTHORIZED');
    await expectError(
      await patch({ fitnessGoal: 'GET_FIT' }, { authorization: 'Bearer forged.token.sig', 'content-type': 'application/json' }),
      401,
      'UNAUTHORIZED',
    );
    expect(repo.updateProfileCalls).toHaveLength(0);
  });

  it('works with the web cookie session too', async () => {
    h.cookieSub = AUTH_ID;
    const res = await patch({ fitnessLevel: 'BEGINNER' }, { 'content-type': 'application/json' });
    expect(res.status).toBe(200);
  });

  it('200: saves goal, level and username; does not complete onboarding by itself', async () => {
    const res = await patch({ fitnessGoal: 'BUILD_STRENGTH', fitnessLevel: 'INTERMEDIATE', username: '  Sung  Jinwoo ' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as UpdateMeResponse;
    expect(body.profile).toMatchObject({
      id: PROFILE_ID,
      username: 'Sung Jinwoo',
      fitnessGoal: 'BUILD_STRENGTH',
      fitnessLevel: 'INTERMEDIATE',
      onboarded: false,
    });
    expect(JSON.stringify(body)).not.toContain('auth_id');
    expect(repo.updateProfileCalls).toEqual([
      { profileId: PROFILE_ID, patch: { fitnessGoal: 'BUILD_STRENGTH', fitnessLevel: 'INTERMEDIATE', username: 'Sung Jinwoo' } },
    ]);
  });

  it('completeOnboarding sets onboarded once; repeating it keeps the first timestamp', async () => {
    const first = (await (await patch({ fitnessGoal: 'GET_FIT', completeOnboarding: true })).json()) as UpdateMeResponse;
    expect(first.profile.onboarded).toBe(true);
    const stamp = repo.profile.onboarded_at;
    expect(stamp).toEqual(expect.any(String));
    await new Promise((r) => setTimeout(r, 5));
    const again = await patch({ completeOnboarding: true });
    expect(again.status).toBe(200);
    expect(repo.profile.onboarded_at).toBe(stamp);
  });

  it('only updates the caller (profile id comes from the session, never the body)', async () => {
    const res = await patch({ id: 'someone-else', fitnessGoal: 'GET_FIT' });
    await expectError(res, 400, 'VALIDATION_FAILED');
    expect(repo.updateProfileCalls).toHaveLength(0);
  });

  it('400 VALIDATION_FAILED with fieldErrors for bad values, unknown keys and empty bodies', async () => {
    const bad = await expectError(
      await patch({ fitnessGoal: 'GET_HUGE', fitnessLevel: 'GOD', username: '', completeOnboarding: false }),
      400,
      'VALIDATION_FAILED',
    );
    expect(Object.keys(bad.fieldErrors).sort()).toEqual(['completeOnboarding', 'fitnessGoal', 'fitnessLevel', 'username']);
    expect(bad.details).toHaveLength(4);
    for (const b of [{}, { onboarded_at: '2020-01-01' }, { role: 'ADMIN' }, { auraPoints: 1e9 }, [], 'null']) {
      await expectError(await patch(b), 400, 'VALIDATION_FAILED');
    }
    expect(repo.updateProfileCalls).toHaveLength(0);
  });

  it('415 / 400 / 413 for bad bodies', async () => {
    await expectError(await patch({ fitnessGoal: 'GET_FIT' }, { authorization: 'Bearer good.token.sig', 'content-type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    await expectError(await patch('{not json'), 400, 'BAD_REQUEST');
    await expectError(await patch({ username: 'x'.repeat(5000) }), 413, 'PAYLOAD_TOO_LARGE');
  });

  it('404 PROFILE_NOT_FOUND when the profile vanished mid-request', async () => {
    const orig = repo.updateProfile.bind(repo);
    repo.updateProfile = async (id, p) => {
      await orig(id, p);
      return null;
    };
    await expectError(await patch({ fitnessGoal: 'GET_FIT' }), 404, 'PROFILE_NOT_FOUND');
  });

  it('500 with a generic message when the data layer fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    repo.updateProfile = async () => {
      throw new Error('db exploded: secret detail');
    };
    const body = await expectError(await patch({ fitnessGoal: 'GET_FIT' }), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret detail');
  });

  it('429 after the per-user burst', async () => {
    for (let i = 0; i < 10; i++) expect((await patch({ fitnessLevel: 'BEGINNER' })).status).toBe(200);
    const res = await expectError(await patch({ fitnessLevel: 'BEGINNER' }), 429, 'RATE_LIMITED');
    expect(res).toBeTruthy();
  });

  it('503 / 401 when auth is not configured', async () => {
    h.configured = false;
    await expectError(await patch({ fitnessGoal: 'GET_FIT' }), 503, 'NOT_CONFIGURED');
    await expectError(await patch({ fitnessGoal: 'GET_FIT' }, { 'content-type': 'application/json' }), 401, 'UNAUTHORIZED');
  });
});
