import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveReminderSettings, updateMe } from './client';

const respond = (status: number, body: unknown = {}) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => vi.restoreAllMocks());

describe('onboarding client', () => {
  it('PATCHes /api/v1/me with a JSON body', async () => {
    const f = respond(200, { profile: { onboarded: true } });
    const r = await updateMe({ fitnessGoal: 'GET_FIT', completeOnboarding: true }, f as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/me');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ fitnessGoal: 'GET_FIT', completeOnboarding: true });
  });

  it('PUTs notification settings with the IANA zone and streak saver', async () => {
    const f = respond(200);
    expect(await saveReminderSettings(20, true, f as unknown as typeof fetch)).toBe('saved');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/me/notification-settings');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ streakSaver: true, dailyReminderHour: 20 });
    expect(typeof body.timezone).toBe('string');
  });

  it.each([404, 501])('%d is non-fatal (endpoint not deployed yet)', async (status) => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await saveReminderSettings(null, true, respond(status) as unknown as typeof fetch)).toBe('unavailable');
  });

  it('other errors and network failures resolve to failed without throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await saveReminderSettings(7, false, respond(500) as unknown as typeof fetch)).toBe('failed');
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await saveReminderSettings(7, false, offline as unknown as typeof fetch)).toBe('failed');
  });
});
