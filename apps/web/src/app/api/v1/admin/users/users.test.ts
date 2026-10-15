/** Route tests for /api/v1/admin/users/** and suspension enforcement, with a stubbed moderation repository. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserSummary } from '@aurafit/shared';
import { AUTH_ID, FakeRepo, makeProfileRow, PROFILE_ID } from '@/test/fake-repo';
import type { ModerationRepository } from '@/lib/moderation/types';

const h = vi.hoisted(() => ({ repo: null as unknown, mrepo: null as unknown }));

vi.mock('@/lib/supabase/env', () => ({
  isAuthConfigured: () => true,
  getPublicSupabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'sb_publishable_x' }),
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
vi.mock('@/lib/moderation', () => ({ getModerationRepository: () => h.mrepo }));

import { mutationLimiter } from '@/lib/api/rate-limit';
import { adminActionLimiter, adminReadLimiter } from '@/lib/moderation/http';
import { GET as search } from './route';
import { GET as summary } from './[profileId]/route';
import { PUT as setRole } from './[profileId]/role/route';
import { POST as suspend } from './[profileId]/suspend/route';
import { POST as unsuspend } from './[profileId]/unsuspend/route';
import { POST as clearFlag } from './[profileId]/clear-flag/route';
import { POST as revert } from './[profileId]/revert/route';
import { POST as completeQuest } from '../../quests/[questId]/complete/route';

const BASE = 'http://localhost/api/v1/admin/users';
const AUTH = { authorization: 'Bearer good.token.sig' };
const JSON_AUTH = { ...AUTH, 'content-type': 'application/json' };
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = JSON_AUTH) =>
  new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (profileId: string) => ({ params: Promise.resolve({ profileId }) });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ code, error: expect.any(String) });
}

function stubRepo(overrides: Partial<ModerationRepository> = {}): ModerationRepository {
  const fail = () => {
    throw new Error('not stubbed');
  };
  return new Proxy(overrides, { get: (t, k) => (k in t ? t[k as keyof ModerationRepository] : fail) }) as ModerationRepository;
}

const asAdmin = () => {
  h.repo = new FakeRepo(makeProfileRow({ role: 'ADMIN' }));
};

beforeEach(() => {
  asAdmin();
  h.mrepo = stubRepo();
  mutationLimiter.reset();
  adminActionLimiter.reset();
  adminReadLimiter.reset();
});
afterEach(() => vi.restoreAllMocks());

describe('access', () => {
  it('401 without credentials, 403 for non-admins and for suspended admins', async () => {
    await expectError(await search(req('', 'GET', undefined, {})), 401, 'UNAUTHORIZED');
    h.repo = new FakeRepo(makeProfileRow({ role: 'CREATOR' }));
    await expectError(await search(req('', 'GET', undefined, AUTH)), 403, 'FORBIDDEN');
    await expectError(await suspend(req(`/${TARGET}/suspend`, 'POST', { reason: 'spam' }), params(TARGET)), 403, 'FORBIDDEN');
    h.repo = new FakeRepo(makeProfileRow({ role: 'ADMIN', suspended_at: '2026-10-01T00:00:00Z' }));
    await expectError(await search(req('', 'GET', undefined, AUTH)), 403, 'FORBIDDEN');
  });

  it('403 when the database says the actor is no longer an admin', async () => {
    h.mrepo = stubRepo({ suspend: async () => ({ status: 'forbidden' }) });
    await expectError(await suspend(req(`/${TARGET}/suspend`, 'POST', { reason: 'spam' }), params(TARGET)), 403, 'FORBIDDEN');
  });
});

describe('search + summary', () => {
  it('passes the normalized query and cursor', async () => {
    const searchUsers = vi.fn<ModerationRepository['searchUsers']>(async () => ({ status: 'ok', page: { items: [], nextAfter: null } }));
    h.mrepo = stubRepo({ searchUsers });
    const res = await search(req('?q=%20%20jin%20%20woo%20&after=%40abc', 'GET', undefined, AUTH));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextAfter: null });
    expect(searchUsers).toHaveBeenCalledWith(PROFILE_ID, 'jin woo', 20, '@abc');
    await expectError(await search(req('?after=%3Cscript%3E', 'GET', undefined, AUTH)), 400, 'VALIDATION_FAILED');
  });

  it('returns the summary, 404 for unknown or malformed ids', async () => {
    const user = { profile: { id: TARGET } } as unknown as AdminUserSummary;
    h.mrepo = stubRepo({ userSummary: async (_a, id) => (id === TARGET ? { status: 'ok', user } : { status: 'not_found' }) });
    const ok = await summary(req(`/${TARGET}`, 'GET', undefined, AUTH), params(TARGET));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ user });
    await expectError(await summary(req(`/${LOG_ID}`, 'GET', undefined, AUTH), params(LOG_ID)), 404, 'NOT_FOUND');
    await expectError(await summary(req('/nope', 'GET', undefined, AUTH), params('not-a-uuid')), 404, 'NOT_FOUND');
  });
});

describe('role', () => {
  it('maps every outcome', async () => {
    let status = 'updated';
    h.mrepo = stubRepo({ setRole: async (_a, _t, role) => (status === 'updated' || status === 'unchanged' ? { status, role } : { status }) as never });
    const put = () => setRole(req(`/${TARGET}/role`, 'PUT', { role: 'CREATOR' }), params(TARGET));
    let res = await put();
    expect(await res.json()).toEqual({ role: 'CREATOR', changed: true });
    status = 'unchanged';
    res = await put();
    expect(await res.json()).toEqual({ role: 'CREATOR', changed: false });
    status = 'cannot_change_self';
    await expectError(await put(), 400, 'CANNOT_CHANGE_OWN_ROLE');
    status = 'last_admin';
    await expectError(await put(), 409, 'LAST_ADMIN');
    status = 'system_profile';
    await expectError(await put(), 409, 'SYSTEM_PROFILE');
    status = 'not_found';
    await expectError(await put(), 404, 'NOT_FOUND');
    await expectError(await setRole(req(`/${TARGET}/role`, 'PUT', { role: 'GOD' }), params(TARGET)), 400, 'VALIDATION_FAILED');
  });
});

describe('suspend / unsuspend', () => {
  it('suspends with a reason and maps conflicts', async () => {
    const calls: string[] = [];
    let status = 'suspended';
    h.mrepo = stubRepo({
      suspend: async (_a, _t, reason) => {
        calls.push(reason);
        return { status } as never;
      },
    });
    const post = (body: unknown = { reason: '  botting  ' }) => suspend(req(`/${TARGET}/suspend`, 'POST', body), params(TARGET));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual(['botting']);
    await expectError(await post({}), 400, 'VALIDATION_FAILED');
    for (const [s, code, http] of [
      ['already_suspended', 'ALREADY_SUSPENDED', 409],
      ['cannot_suspend_self', 'CANNOT_SUSPEND_SELF', 400],
      ['cannot_suspend_admin', 'CANNOT_SUSPEND_ADMIN', 409],
      ['system_profile', 'SYSTEM_PROFILE', 409],
      ['not_found', 'NOT_FOUND', 404],
    ] as const) {
      status = s;
      await expectError(await post(), http, code);
    }
  });

  it('unsuspends', async () => {
    let status = 'unsuspended';
    h.mrepo = stubRepo({ unsuspend: async () => ({ status }) as never });
    const post = () => unsuspend(req(`/${TARGET}/unsuspend`, 'POST', undefined, AUTH), params(TARGET));
    expect((await post()).status).toBe(200);
    status = 'not_suspended';
    await expectError(await post(), 409, 'NOT_SUSPENDED');
  });
});

describe('clear-flag + revert', () => {
  it('clear-flag accepts an empty body or a note', async () => {
    const notes: (string | undefined)[] = [];
    h.mrepo = stubRepo({
      clearFlag: async (_a, _t, note) => {
        notes.push(note);
        return { status: 'cleared' };
      },
    });
    expect((await clearFlag(req(`/${TARGET}/clear-flag`, 'POST', undefined, AUTH), params(TARGET))).status).toBe(200);
    expect((await clearFlag(req(`/${TARGET}/clear-flag`, 'POST', { note: 'legit runner' }), params(TARGET))).status).toBe(200);
    expect(notes).toEqual([undefined, 'legit runner']);
  });

  it('reverts one ledger row', async () => {
    let status = 'reverted';
    h.mrepo = stubRepo({ revertLog: async () => (status === 'reverted' ? { status, auraRemoved: 150, auraPoints: 850 } : { status }) as never });
    const post = (body: unknown = { kind: 'WORKOUT', logId: LOG_ID }) => revert(req(`/${TARGET}/revert`, 'POST', body), params(TARGET));
    const res = await post();
    expect(await res.json()).toEqual({ auraRemoved: 150, auraPoints: 850 });
    status = 'not_found';
    await expectError(await post(), 404, 'LOG_NOT_FOUND');
    await expectError(await post({ kind: 'BOSS', logId: 'x' }), 400, 'VALIDATION_FAILED');
  });
});

describe('suspension enforcement', () => {
  it('suspended accounts get 403 SUSPENDED on game mutations', async () => {
    const repo = new FakeRepo(makeProfileRow({ suspended_at: '2026-10-01T00:00:00Z', suspension_reason: 'Botting' }));
    h.repo = repo;
    const res = await completeQuest(
      new Request('http://localhost/api/v1/quests/q1/complete', { method: 'POST', headers: JSON_AUTH, body: '{}' }),
      { params: Promise.resolve({ questId: 'q1' }) },
    );
    await expectError(res, 403, 'SUSPENDED');
    expect(repo.calls.completeQuest).toHaveLength(0);
  });
});
