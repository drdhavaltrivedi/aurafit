import { describe, expect, it } from 'vitest';
import { apiFetch } from './api-client';

const respond = (status: number, body: unknown) => async () =>
  new Response(body === undefined ? 'not json' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiFetch', () => {
  it('returns data on 2xx', async () => {
    expect(await apiFetch('/x', {}, respond(200, { a: 1 }) as typeof fetch)).toEqual({ ok: true, data: { a: 1 } });
  });

  it('maps API errors to code + message', async () => {
    const r = await apiFetch('/x', {}, respond(409, { error: 'Quest already completed today.', code: 'ALREADY_COMPLETED' }) as typeof fetch);
    expect(r).toEqual({ ok: false, status: 409, code: 'ALREADY_COMPLETED', message: 'Quest already completed today.' });
  });

  it('handles non-JSON errors and network failures', async () => {
    expect(await apiFetch('/x', {}, respond(502, undefined) as typeof fetch)).toMatchObject({ ok: false, status: 502, code: 'INTERNAL_ERROR' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await apiFetch('/x', {}, offline)).toMatchObject({ ok: false, status: 0, code: 'NETWORK_ERROR' });
  });
});
