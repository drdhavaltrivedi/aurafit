/** Route tests for GET/PUT /api/v1/me/notification-settings and POST/DELETE /api/v1/me/push-tokens. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@aurafit/shared';
import { AUTH_ID, FakeRepo, PROFILE_ID } from '@/test/fake-repo';
import { FakeNotificationRepo } from '@/test/fake-notification-repo';

const h = vi.hoisted(() => ({ configured: true, repo: null as unknown, nrepo: null as unknown, cookieSub: null as string | null }));

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
vi.mock('@/lib/notifications', () => ({ getNotificationRepository: () => h.nrepo }));

import { mutationLimiter } from '@/lib/api/rate-limit';
import { GET as getSettings, PUT as putSettings } from './notification-settings/route';
import { DELETE as deleteToken, POST as postToken } from './push-tokens/route';

const BASE = 'http://localhost/api/v1/me';
const AUTH = { authorization: 'Bearer good.token.sig' };
const JSON_AUTH = { ...AUTH, 'content-type': 'application/json' };
const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
let nrepo: FakeNotificationRepo;

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = JSON_AUTH) =>
  new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

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
  h.repo = new FakeRepo();
  nrepo = new FakeNotificationRepo();
  h.nrepo = nrepo;
  mutationLimiter.reset();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /api/v1/me/notification-settings', () => {
  it('401 without credentials and with a forged token', async () => {
    await expectError(await getSettings(req('/notification-settings', 'GET', undefined, {})), 401, 'UNAUTHORIZED');
    await expectError(await getSettings(req('/notification-settings', 'GET', undefined, { authorization: 'Bearer forged.x.y' })), 401, 'UNAUTHORIZED');
  });

  it('returns defaults before anything was saved, then the saved settings', async () => {
    let res = await getSettings(req('/notification-settings', 'GET', undefined, AUTH));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    nrepo.settings.set(PROFILE_ID, { timezone: 'Asia/Tokyo', streakSaver: false, dailyReminderHour: 7 });
    res = await getSettings(req('/notification-settings', 'GET', undefined, AUTH));
    expect(await res.json()).toEqual({ timezone: 'Asia/Tokyo', streakSaver: false, dailyReminderHour: 7 });
  });

  it('cookie sessions work too (web /account)', async () => {
    h.cookieSub = AUTH_ID;
    expect((await getSettings(req('/notification-settings', 'GET', undefined, {}))).status).toBe(200);
  });

  it('503 when the server has no secret key; 500 with a generic message on DB failure', async () => {
    h.nrepo = null;
    await expectError(await getSettings(req('/notification-settings', 'GET', undefined, AUTH)), 503, 'NOT_CONFIGURED');
    h.nrepo = nrepo;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    nrepo.failWith = new Error('db exploded');
    const body = await expectError(await getSettings(req('/notification-settings', 'GET', undefined, AUTH)), 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('exploded');
  });
});

describe('PUT /api/v1/me/notification-settings', () => {
  const valid: NotificationSettings = { timezone: 'America/Los_Angeles', streakSaver: true, dailyReminderHour: 18 };

  it('saves for the caller only and echoes the saved settings', async () => {
    const res = await putSettings(req('/notification-settings', 'PUT', { ...valid, extra: 'ignored' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(valid);
    expect(nrepo.settings.get(PROFILE_ID)).toEqual(valid);
    expect([...nrepo.settings.keys()]).toEqual([PROFILE_ID]);
  });

  it('accepts null hour and UTC', async () => {
    const res = await putSettings(req('/notification-settings', 'PUT', { timezone: 'UTC', streakSaver: false, dailyReminderHour: null }));
    expect(res.status).toBe(200);
  });

  it.each([
    [{ ...valid, timezone: 'Mars/Olympus' }, 'timezone'],
    [{ ...valid, timezone: '' }, 'timezone'],
    [{ ...valid, timezone: 42 }, 'timezone'],
    [{ ...valid, streakSaver: 'yes' }, 'streakSaver'],
    [{ ...valid, dailyReminderHour: 24 }, 'dailyReminderHour'],
    [{ ...valid, dailyReminderHour: -1 }, 'dailyReminderHour'],
    [{ ...valid, dailyReminderHour: 7.5 }, 'dailyReminderHour'],
    [{ timezone: 'UTC' }, 'streakSaver'],
  ])('400 VALIDATION_FAILED for %j', async (body, field) => {
    const err = await expectError(await putSettings(req('/notification-settings', 'PUT', body)), 400, 'VALIDATION_FAILED');
    expect(err.fieldErrors).toHaveProperty(field);
    expect(nrepo.settings.size).toBe(0);
  });

  it('415 / 400 / 413 for bad bodies; 401 without auth', async () => {
    await expectError(await putSettings(req('/notification-settings', 'PUT', valid, AUTH)), 415, 'UNSUPPORTED_MEDIA_TYPE');
    await expectError(await putSettings(req('/notification-settings', 'PUT', '{nope')), 400, 'BAD_REQUEST');
    await expectError(await putSettings(req('/notification-settings', 'PUT', { ...valid, pad: 'x'.repeat(2000) })), 413, 'PAYLOAD_TOO_LARGE');
    await expectError(await putSettings(req('/notification-settings', 'PUT', valid, { 'content-type': 'application/json' })), 401, 'UNAUTHORIZED');
  });

  it('is rate limited', async () => {
    for (let i = 0; i < 10; i++) expect((await putSettings(req('/notification-settings', 'PUT', valid))).status).toBe(200);
    const res = await putSettings(req('/notification-settings', 'PUT', valid));
    await expectError(res, 429, 'RATE_LIMITED');
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST / DELETE /api/v1/me/push-tokens', () => {
  it('registers a token (idempotent) and returns 204', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await postToken(req('/push-tokens', 'POST', { token: TOKEN, platform: 'ios' }));
      expect(res.status).toBe(204);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(nrepo.tokens.get(TOKEN)).toEqual({ userId: PROFILE_ID, platform: 'ios' });
    expect(nrepo.tokens.size).toBe(1);
  });

  it('accepts the newer ExpoPushToken[...] prefix', async () => {
    expect((await postToken(req('/push-tokens', 'POST', { token: 'ExpoPushToken[abc]', platform: 'android' }))).status).toBe(204);
  });

  it.each([
    [{ token: 'abc', platform: 'ios' }, 'token'],
    [{ token: 'ExponentPushToken[]', platform: 'ios' }, 'token'],
    [{ token: `ExponentPushToken[${'a'.repeat(300)}]`, platform: 'ios' }, 'token'],
    [{ token: TOKEN, platform: 'web' }, 'platform'],
    [{ token: TOKEN }, 'platform'],
  ])('400 for %j', async (body, field) => {
    const err = await expectError(await postToken(req('/push-tokens', 'POST', body)), 400, 'VALIDATION_FAILED');
    expect(err.fieldErrors).toHaveProperty(field);
    expect(nrepo.tokens.size).toBe(0);
  });

  it('401 without auth; nothing stored', async () => {
    await expectError(await postToken(req('/push-tokens', 'POST', { token: TOKEN, platform: 'ios' }, { 'content-type': 'application/json' })), 401, 'UNAUTHORIZED');
    expect(nrepo.tokens.size).toBe(0);
  });

  it("DELETE removes the caller's token but never another user's", async () => {
    nrepo.tokens.set(TOKEN, { userId: PROFILE_ID, platform: 'ios' });
    nrepo.tokens.set('ExponentPushToken[someone_else]', { userId: 'other-user', platform: 'android' });
    expect((await deleteToken(req('/push-tokens', 'DELETE', { token: 'ExponentPushToken[someone_else]' }))).status).toBe(204);
    expect(nrepo.tokens.has('ExponentPushToken[someone_else]')).toBe(true);
    expect((await deleteToken(req('/push-tokens', 'DELETE', { token: TOKEN }))).status).toBe(204);
    expect(nrepo.tokens.has(TOKEN)).toBe(false);
    // Idempotent.
    expect((await deleteToken(req('/push-tokens', 'DELETE', { token: TOKEN }))).status).toBe(204);
    await expectError(await deleteToken(req('/push-tokens', 'DELETE', { token: 'nope' })), 400, 'VALIDATION_FAILED');
  });
});
