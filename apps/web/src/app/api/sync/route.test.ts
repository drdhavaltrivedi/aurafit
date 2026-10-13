import { describe, expect, it } from 'vitest';
import { MAX_AURA_PER_SYNC, MAX_SYNC_BODY_BYTES } from '@aurafit/shared';
import { POST } from './route';

const URL = 'http://localhost/api/sync';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/sync', () => {
  it('accepts a valid payload with an honest pending status', async () => {
    const res = await POST(jsonRequest({ userId: 'usr_jinwoo_99', auraGained: 250, questId: 'q_daily_1' }));
    expect(res.status).toBe(202);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      status: 'PENDING_VALIDATION',
      persisted: false,
      accepted: { userId: 'usr_jinwoo_99', auraGained: 250, questId: 'q_daily_1' },
    });
    expect(body.receipt).toMatch(UUID_RE);
    expect(new Date(body.receivedAt).toISOString()).toBe(body.receivedAt);
    expect(JSON.stringify(body)).not.toContain('VERIFIED');
  });

  it('issues a unique receipt per request', async () => {
    const a = await (await POST(jsonRequest({ userId: 'u1' }))).json();
    const b = await (await POST(jsonRequest({ userId: 'u1' }))).json();
    expect(a.receipt).not.toBe(b.receipt);
  });

  it('accepts content-type with charset parameter', async () => {
    const res = await POST(jsonRequest({ userId: 'u1' }, { 'content-type': 'application/json; charset=utf-8' }));
    expect(res.status).toBe(202);
  });

  it.each([
    ['text/plain', '{"userId":"u1"}'],
    ['application/x-www-form-urlencoded', 'userId=u1'],
    ['multipart/form-data; boundary=x', '--x--'],
  ])('rejects content-type %s with 415', async (contentType, body) => {
    const res = await POST(new Request(URL, { method: 'POST', headers: { 'content-type': contentType }, body }));
    expect(res.status).toBe(415);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).success).toBe(false);
  });

  it('rejects a missing content-type with 415', async () => {
    const req = new Request(URL, { method: 'POST', body: new Uint8Array([123, 125]) });
    req.headers.delete('content-type');
    expect((await POST(req)).status).toBe(415);
  });

  it('rejects malformed JSON with 400', async () => {
    for (const raw of ['{', '', 'not json', '{"userId":}']) {
      const res = await POST(jsonRequest(raw));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Malformed JSON body');
    }
  });

  it('rejects an oversized body with 413 (actual size)', async () => {
    const big = JSON.stringify({ userId: 'u1', pad: 'x'.repeat(MAX_SYNC_BODY_BYTES) });
    const res = await POST(jsonRequest(big));
    expect(res.status).toBe(413);
  });

  it('rejects an oversized declared content-length with 413', async () => {
    const res = await POST(jsonRequest({ userId: 'u1' }, { 'content-length': String(MAX_SYNC_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
  });

  it('rejects a streamed oversized body without content-length with 413', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ > 20) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const req = new Request(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error -- `duplex` is required by undici for streaming bodies but missing from lib.dom types
      duplex: 'half',
    });
    expect((await POST(req)).status).toBe(413);
  });

  it('rejects invalid UTF-8 with 400', async () => {
    const req = new Request(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    });
    expect((await POST(req)).status).toBe(400);
  });

  it('rejects schema violations with 400 and details', async () => {
    const cases: unknown[] = [
      {},
      [],
      null,
      { auraGained: 100 },
      { userId: 'u1', auraGained: MAX_AURA_PER_SYNC + 1, questId: 'q' },
      { userId: 'u1', auraGained: -5, questId: 'q' },
      { userId: 'u1', auraGained: '100', questId: 'q' },
      { userId: 'u1', auraGained: 100 },
      { userId: 'u1', antiCheatStatus: 'VERIFIED' },
      { userId: 'x'.repeat(500) },
    ];
    for (const payload of cases) {
      const res = await POST(jsonRequest(payload));
      expect(res.status, JSON.stringify(payload)).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid sync payload');
      expect(Array.isArray(body.details)).toBe(true);
      expect(body.details.length).toBeGreaterThan(0);
    }
  });
});
