import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type ApiClientOptions } from '../src/api/client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(responses: Array<Response | ((init: RequestInit) => Promise<Response>)>, opts: Partial<ApiClientOptions> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return typeof next === 'function' ? next(init ?? {}) : next;
  });
  const getAccessToken = vi.fn(async () => 'token-1');
  const refreshAccessToken = vi.fn(async () => 'token-2');
  const onUnauthorized = vi.fn();
  const client = createApiClient({
    baseUrl: 'https://api.example.com/',
    getAccessToken,
    refreshAccessToken,
    onUnauthorized,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...opts,
  });
  return { client, calls, fetchImpl, getAccessToken, refreshAccessToken, onUnauthorized };
}

const headerOf = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('api client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const me = { profile: { id: 'u1' }, quests: [] };
    const { client, calls } = setup([jsonResponse(200, me)]);
    await expect(client.getMe()).resolves.toEqual(me);
    expect(calls[0].url).toBe('https://api.example.com/api/v1/me');
    expect(headerOf(calls[0].init, 'Authorization')).toBe('Bearer token-1');
    expect(calls[0].init.method).toBe('GET');
  });

  it('omits Authorization when signed out', async () => {
    const { client, calls } = setup([jsonResponse(200, [])], { getAccessToken: async () => null });
    await client.getDrops();
    expect(headerOf(calls[0].init, 'Authorization')).toBeUndefined();
  });

  it('url-encodes path ids and POSTs', async () => {
    const { client, calls } = setup([jsonResponse(200, { status: 'completed' })]);
    await client.completeQuest('a/b c');
    expect(calls[0].url).toBe('https://api.example.com/api/v1/quests/a%2Fb%20c/complete');
    expect(calls[0].init.method).toBe('POST');
  });

  it('sends JSON bodies with a content type', async () => {
    const { client, calls } = setup([jsonResponse(201, { drop: { id: 'd1' } })]);
    await client.createDrop({ title: 'x' } as never);
    expect(headerOf(calls[0].init, 'Content-Type')).toBe('application/json');
    expect(calls[0].init.body).toBe(JSON.stringify({ title: 'x' }));
  });

  it('maps error bodies to a typed ApiError', async () => {
    const { client } = setup([jsonResponse(409, { error: 'Already done', code: 'ALREADY_COMPLETED' })]);
    const err = await client.completeQuest('q1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'ALREADY_COMPLETED', message: 'Already done' });
  });

  it('falls back to status-derived codes for non-JSON errors', async () => {
    const { client } = setup([new Response('<html>nope</html>', { status: 404 })]);
    await expect(client.getDrops()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('retries once on 401 with a refreshed token', async () => {
    const { client, calls, refreshAccessToken, onUnauthorized } = setup([
      jsonResponse(401, { error: 'expired', code: 'UNAUTHORIZED' }),
      jsonResponse(200, { hunters: [], squads: [] }),
    ]);
    await expect(client.getLeaderboard()).resolves.toEqual({ hunters: [], squads: [] });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(headerOf(calls[1].init, 'Authorization')).toBe('Bearer token-2');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('gives up after one retry and reports unauthorized', async () => {
    const { client, fetchImpl, onUnauthorized } = setup([
      jsonResponse(401, { error: 'expired', code: 'UNAUTHORIZED' }),
      jsonResponse(401, { error: 'still expired', code: 'UNAUTHORIZED' }),
    ]);
    await expect(client.getMe()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the refresh fails', async () => {
    const { client, fetchImpl, onUnauthorized } = setup(
      [jsonResponse(401, { error: 'expired', code: 'UNAUTHORIZED' })],
      { refreshAccessToken: async () => null }
    );
    await expect(client.getMe()).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('times out via AbortController', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    const { client } = setup([hang], { timeoutMs: 20 });
    await expect(client.getMe()).rejects.toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('reports caller aborts as ABORTED', async () => {
    const hang = (init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    const { client } = setup([hang]);
    const ctrl = new AbortController();
    const p = client.getMe(ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('wraps network failures', async () => {
    const { client } = setup([
      async () => {
        throw new TypeError('Network request failed');
      },
    ]);
    await expect(client.getMe()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('rejects invalid JSON success bodies', async () => {
    const { client } = setup([new Response('not json', { status: 200 })]);
    await expect(client.getMe()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
