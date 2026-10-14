/** Tests for POST /api/cron/notifications: auth, batching, idempotency, ticket/receipt token cleanup. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCronResponse } from '@aurafit/shared';
import { FakeNotificationRepo } from '@/test/fake-notification-repo';

const h = vi.hoisted(() => ({ nrepo: null as unknown }));
vi.mock('@/lib/notifications', () => ({ getNotificationRepository: () => h.nrepo }));

import { EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL } from '@/lib/notifications/expo';
import { POST } from './route';

const SECRET = 'c'.repeat(64);
const URL_CRON = 'http://localhost/api/cron/notifications';
let repo: FakeNotificationRepo;

const call = (authorization?: string) =>
  POST(new Request(URL_CRON, { method: 'POST', headers: authorization ? { authorization } : {}, body: '{}' }));

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch stub for Expo; `send` decides tickets per message, `receipts` answers getReceipts. */
function stubExpo(
  opts: {
    send?: (messages: { to: string }[], callIndex: number) => Response;
    receipts?: (ids: string[]) => Response;
  } = {},
) {
  const sent: Sent[] = [];
  let sends = 0;
  let n = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? 'null'));
    sent.push({ url, headers: init?.headers as Record<string, string>, body });
    if (url === EXPO_PUSH_SEND_URL) {
      const messages = body as { to: string }[];
      if (opts.send) return opts.send(messages, sends++);
      return Response.json({ data: messages.map(() => ({ status: 'ok', id: `ticket-${++n}` })) });
    }
    if (url === EXPO_PUSH_RECEIPTS_URL) {
      return opts.receipts ? opts.receipts((body as { ids: string[] }).ids) : Response.json({ data: {} });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock, sendCalls: () => sent.filter((s) => s.url === EXPO_PUSH_SEND_URL) };
}

function addUser(id: string, tokens: number, kind: 'STREAK_SAVER' | 'DAILY_REMINDER' = 'STREAK_SAVER', streakDays = 3) {
  for (let i = 0; i < tokens; i++) repo.tokens.set(`ExponentPushToken[${id}_${i}]`, { userId: id, platform: 'ios' });
  repo.due[kind].push({ userId: id, localDate: '2026-10-14', streakDays });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  vi.stubEnv('EXPO_ACCESS_TOKEN', '');
  repo = new FakeNotificationRepo();
  h.nrepo = repo;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth', () => {
  it('503 when CRON_SECRET is unset or too short (never runs)', async () => {
    const { fetchMock } = stubExpo();
    vi.stubEnv('CRON_SECRET', '');
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'short');
    expect((await call('Bearer short')).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer wrong', `Basic ${SECRET}`, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, 'Bearer '])(
    '401 for authorization=%s',
    async (header) => {
      addUser('u1', 1);
      const { fetchMock } = stubExpo();
      const res = await call(header);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(repo.ledger.size).toBe(0);
    },
  );

  it('503 NOT_CONFIGURED without a Supabase secret key', async () => {
    h.nrepo = null;
    stubExpo();
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
  });
});

describe('sending', () => {
  it('sends the streak-saver copy with the quests deep link and reports counts', async () => {
    addUser('u1', 2, 'STREAK_SAVER', 12);
    addUser('u2', 1, 'DAILY_REMINDER');
    const { sendCalls } = stubExpo();
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NotificationCronResponse;
    expect(body.kinds).toEqual({ STREAK_SAVER: { claimed: 1, sent: 1, failed: 0 }, DAILY_REMINDER: { claimed: 1, sent: 1, failed: 0 } });
    expect(body).toMatchObject({ messages: 3, tickets: { ok: 3, error: 0 }, tokensRemoved: 0 });
    expect(JSON.stringify(body)).not.toContain('ExponentPushToken');

    const [streak, daily] = sendCalls().map((c) => c.body as Record<string, unknown>[]);
    expect(streak).toHaveLength(2);
    expect(streak[0]).toMatchObject({
      to: 'ExponentPushToken[u1_0]',
      body: 'Your 12-day streak ends at midnight. A 5-minute quest keeps it alive.',
      data: { url: 'aurafit://quests', kind: 'STREAK_SAVER' },
      sound: 'default',
      channelId: 'reminders',
    });
    expect(daily[0]).toMatchObject({ to: 'ExponentPushToken[u2_0]', body: "Time to level up. Today's quests are waiting.", data: { url: 'aurafit://quests' } });
    expect(repo.tickets.map((t) => t.ticketId)).toEqual(['ticket-1', 'ticket-2', 'ticket-3']);
  });

  it('batches at most 100 messages per Expo request', async () => {
    for (let i = 0; i < 230; i++) addUser(`u${i}`, 1);
    const { sendCalls } = stubExpo();
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(sendCalls().map((c) => (c.body as unknown[]).length)).toEqual([100, 100, 30]);
    expect(body.kinds.STREAK_SAVER).toEqual({ claimed: 230, sent: 230, failed: 0 });
  });

  it('sends the optional EXPO_ACCESS_TOKEN as a bearer header (and none without it)', async () => {
    addUser('u1', 1);
    let { sendCalls } = stubExpo();
    await call(`Bearer ${SECRET}`);
    expect(sendCalls()[0].headers.Authorization).toBeUndefined();

    vi.stubEnv('EXPO_ACCESS_TOKEN', 'expo-access');
    repo.ledger.clear();
    ({ sendCalls } = stubExpo());
    await call(`Bearer ${SECRET}`);
    expect(sendCalls()[0].headers.Authorization).toBe('Bearer expo-access');
  });

  it('is idempotent: a second run in the same hour sends nothing', async () => {
    addUser('u1', 1);
    const { sendCalls } = stubExpo();
    await call(`Bearer ${SECRET}`);
    const second = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(sendCalls()).toHaveLength(1);
    expect(second.kinds.STREAK_SAVER.claimed).toBe(0);
    expect(second.messages).toBe(0);
  });

  it('releases claims when Expo is unreachable, so a re-run retries them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    addUser('u1', 1);
    stubExpo({ send: () => new Response('upstream down', { status: 503 }) });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(body.kinds.STREAK_SAVER).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(repo.released).toEqual([{ kind: 'STREAK_SAVER', userId: 'u1', localDate: '2026-10-14' }]);
    expect(repo.ledger.size).toBe(0);

    const { sendCalls } = stubExpo();
    const retry = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(retry.kinds.STREAK_SAVER.sent).toBe(1);
    expect(sendCalls()).toHaveLength(1);
  });

  it('a network error in one batch only releases users with nothing delivered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 150; i++) addUser(`u${i}`, 1);
    stubExpo({
      send: (messages, idx) => {
        if (idx === 1) throw new TypeError('fetch failed');
        return Response.json({ data: messages.map((_, j) => ({ status: 'ok', id: `t${idx}-${j}` })) });
      },
    });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(body.kinds.STREAK_SAVER).toEqual({ claimed: 150, sent: 100, failed: 50 });
    expect(repo.released).toHaveLength(50);
  });
});

describe('token cleanup', () => {
  it('deletes tokens whose ticket says DeviceNotRegistered; keeps the claim (no retry)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    addUser('u1', 2);
    stubExpo({
      send: (messages) =>
        Response.json({
          data: messages.map((m) =>
            m.to.endsWith('_0]')
              ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered', expoPushToken: m.to } }
              : { status: 'ok', id: 'good-ticket' },
          ),
        }),
    });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(body).toMatchObject({ tickets: { ok: 1, error: 1 }, tokensRemoved: 1 });
    expect([...repo.tokens.keys()]).toEqual(['ExponentPushToken[u1_1]']);
    expect(repo.released).toEqual([]);
  });

  it('checks receipts of tickets older than 15 minutes and deletes DeviceNotRegistered tokens', async () => {
    const old = new Date(Date.now() - 20 * 60 * 1000);
    repo.tokens.set('ExponentPushToken[dead]', { userId: 'u1', platform: 'android' });
    repo.tokens.set('ExponentPushToken[alive]', { userId: 'u1', platform: 'ios' });
    repo.tickets.push(
      { ticketId: 'r-dead', token: 'ExponentPushToken[dead]', createdAt: old },
      { ticketId: 'r-ok', token: 'ExponentPushToken[alive]', createdAt: old },
      { ticketId: 'r-pending', token: 'ExponentPushToken[alive]', createdAt: old },
      { ticketId: 'r-fresh', token: 'ExponentPushToken[alive]', createdAt: new Date() },
    );
    const { sent } = stubExpo({
      receipts: () =>
        Response.json({
          data: {
            'r-dead': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
            'r-ok': { status: 'ok' },
          },
        }),
    });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    const receiptCall = sent.find((s) => s.url === EXPO_PUSH_RECEIPTS_URL)!;
    expect((receiptCall.body as { ids: string[] }).ids.sort()).toEqual(['r-dead', 'r-ok', 'r-pending']);
    expect(body).toMatchObject({ receiptsChecked: 2, tokensRemoved: 1 });
    expect([...repo.tokens.keys()]).toEqual(['ExponentPushToken[alive]']);
    // Settled receipts are removed; the pending and fresh ones stay for the next run.
    expect(repo.tickets.map((t) => t.ticketId).sort()).toEqual(['r-fresh', 'r-pending']);
  });

  it('a failing receipts request does not block sending', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    repo.tickets.push({ ticketId: 'r1', token: 'ExponentPushToken[x]', createdAt: new Date(0) });
    addUser('u1', 1);
    stubExpo({ receipts: () => new Response('nope', { status: 500 }) });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as NotificationCronResponse;
    expect(body.kinds.STREAK_SAVER.sent).toBe(1);
    expect(repo.tickets.some((t) => t.ticketId === 'r1')).toBe(true);
  });

  it('500 with a generic body when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubExpo();
    repo.failWith = new Error('db exploded');
    vi.spyOn(repo, 'claimDue').mockRejectedValue(new Error('db exploded'));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('exploded');
  });
});
