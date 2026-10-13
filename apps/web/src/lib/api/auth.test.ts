import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ID, FakeRepo, makeProfileRow } from '@/test/fake-repo';

type Claims = Record<string, unknown>;
const h = vi.hoisted(() => ({
  configured: true,
  repo: null as unknown,
  tokens: new Map<string, Claims>(),
  cookieClaims: null as Claims | null,
  verifierCalls: [] as Array<string | undefined>,
  cookieCalls: 0,
  throwOnVerify: false,
}));

vi.mock('@/lib/supabase/env', () => ({
  isAuthConfigured: () => h.configured,
  getPublicSupabaseConfig: () => (h.configured ? { url: 'https://example.supabase.co', key: 'sb_publishable_x' } : null),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createTokenVerifier: () => ({
    auth: {
      getClaims: async (token?: string) => {
        h.verifierCalls.push(token);
        if (h.throwOnVerify) throw new Error('network down');
        const claims = token ? h.tokens.get(token) : undefined;
        return claims ? { data: { claims }, error: null } : { data: null, error: new Error('invalid JWT') };
      },
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => {
        h.cookieCalls++;
        return { data: h.cookieClaims ? { claims: h.cookieClaims } : null, error: null };
      },
    },
  }),
}));
vi.mock('@/lib/data', () => ({ getRepository: () => h.repo }));

import { forbidUnless, rateLimit, requireUser } from './auth';
import { mutationLimiter } from './rate-limit';

const req = (headers: Record<string, string> = {}) => new Request('http://localhost/api/v1/me', { headers });

beforeEach(() => {
  h.configured = true;
  h.repo = new FakeRepo();
  h.tokens = new Map([['good.token.sig', { sub: AUTH_ID, email: 'j@example.com' }]]);
  h.cookieClaims = null;
  h.verifierCalls = [];
  h.cookieCalls = 0;
  h.throwOnVerify = false;
  mutationLimiter.reset();
});

describe('requireUser', () => {
  it('without Supabase env: 401 when no credentials are sent, 503 NOT_CONFIGURED for a bearer token', async () => {
    h.configured = false;
    const anon = await requireUser(req());
    expect(!anon.ok && anon.response.status).toBe(401);
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(503);
      expect(await r.response.json()).toMatchObject({ code: 'NOT_CONFIGURED' });
    }
  });

  it('returns 503 when the secret key (repository) is missing', async () => {
    h.repo = null;
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    expect(!r.ok && r.response.status).toBe(503);
  });

  it('authenticates a valid bearer token via getClaims(token) and loads the profile', async () => {
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user).toMatchObject({ authId: AUTH_ID, email: 'j@example.com', via: 'bearer' });
      expect(r.user.profile.handle).toBe('@jinwoo');
    }
    expect(h.verifierCalls).toEqual(['good.token.sig']);
    expect(h.cookieCalls).toBe(0);
  });

  it('rejects an invalid bearer token with 401 and does not fall back to cookies', async () => {
    h.cookieClaims = { sub: AUTH_ID };
    const r = await requireUser(req({ authorization: 'Bearer forged.token.sig' }));
    expect(!r.ok && r.response.status).toBe(401);
    if (!r.ok) {
      expect(r.response.headers.get('cache-control')).toBe('no-store');
      expect(await r.response.json()).toMatchObject({ code: 'UNAUTHORIZED', error: expect.any(String) });
    }
    expect(h.cookieCalls).toBe(0);
  });

  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'Token good.token.sig'])('rejects malformed Authorization "%s"', async (value) => {
    const r = await requireUser(req({ authorization: value }));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('treats verifier exceptions as unauthenticated (never 500)', async () => {
    h.throwOnVerify = true;
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('authenticates the cookie session when no Authorization header is sent', async () => {
    h.cookieClaims = { sub: AUTH_ID };
    const r = await requireUser(req());
    expect(r.ok && r.user.via).toBe('cookie');
  });

  it('returns 401 without any credentials', async () => {
    const r = await requireUser(req());
    expect(!r.ok && r.response.status).toBe(401);
  });

  it('rejects anonymous sessions with 403', async () => {
    h.tokens.set('anon.token.sig', { sub: AUTH_ID, is_anonymous: true });
    const r = await requireUser(req({ authorization: 'Bearer anon.token.sig' }));
    expect(!r.ok && r.response.status).toBe(403);
  });

  it('returns 404 PROFILE_NOT_FOUND when the user has no profile', async () => {
    h.tokens.set('new.token.sig', { sub: '22222222-2222-4222-8222-222222222222' });
    const r = await requireUser(req({ authorization: 'Bearer new.token.sig' }));
    expect(!r.ok && r.response.status).toBe(404);
    if (!r.ok) expect((await r.response.json()).code).toBe('PROFILE_NOT_FOUND');
  });

  it('returns 500 (without leaking details) when the profile lookup fails', async () => {
    (h.repo as FakeRepo).failWith = new Error('connection refused: postgres://secret');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    spy.mockRestore();
    expect(!r.ok && r.response.status).toBe(500);
    if (!r.ok) expect(await r.response.text()).not.toContain('secret');
  });

  it('ignores user_metadata role claims: permissions come from profiles.role', async () => {
    h.tokens.set('meta.token.sig', { sub: AUTH_ID, user_metadata: { role: 'ADMIN' }, app_metadata: {} });
    const r = await requireUser(req({ authorization: 'Bearer meta.token.sig' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(forbidUnless(r.user, 'ASSIGN_USER_ROLES')?.status).toBe(403);
  });
});

describe('forbidUnless / rateLimit', () => {
  it('allows permitted roles', async () => {
    h.repo = new FakeRepo(makeProfileRow({ role: 'CREATOR' }));
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    if (!r.ok) throw new Error('expected ok');
    expect(forbidUnless(r.user, 'PUBLISH_WORKOUT_DROP')).toBeNull();
  });

  it('returns 429 with Retry-After once the bucket is empty', async () => {
    const r = await requireUser(req({ authorization: 'Bearer good.token.sig' }));
    if (!r.ok) throw new Error('expected ok');
    for (let i = 0; i < 10; i++) expect(rateLimit(r.user)).toBeNull();
    const limited = rateLimit(r.user);
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limited?.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
