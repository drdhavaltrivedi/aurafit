import { writeFile, mkdir } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRepo, makeProfileRow } from '@/test/fake-repo';

const h = vi.hoisted(() => ({ repo: null as unknown }));
vi.mock('@/lib/data', () => ({ getRepository: () => h.repo }));

import { GET } from './route';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const get = (query: string) => GET(new Request(`http://localhost/api/og/rank${query}`));

async function pngSize(res: Response): Promise<{ width: number; height: number }> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  // IHDR: width/height are the first two big-endian uint32s after the 16-byte header.
  const size = { width: view.getUint32(16), height: view.getUint32(20) };
  if (process.env.OG_TEST_OUT) {
    await mkdir(process.env.OG_TEST_OUT, { recursive: true });
    await writeFile(`${process.env.OG_TEST_OUT}/test-${size.width}x${size.height}-${res.status}.png`, bytes);
  }
  return size;
}

let repo: FakeRepo;
beforeEach(() => {
  repo = new FakeRepo(makeProfileRow({ handle: '@jinwoo', aura_points: '8450', streak_days: 14 }));
  h.repo = repo;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/og/rank', () => {
  it('renders a 1080x1920 PNG for a public profile with CDN cache headers', async () => {
    const res = await get('?handle=@jinwoo');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=3600');
    expect(await pngSize(res)).toEqual({ width: 1080, height: 1920 });
    expect(repo.publicProfileCalls).toEqual(['@jinwoo']);
  }, 30_000);

  it('accepts the handle without @ and renders 1080x1080 with format=square', async () => {
    const res = await get('?handle=jinwoo&format=square&v=8450');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await pngSize(res)).toEqual({ width: 1080, height: 1080 });
    expect(repo.publicProfileCalls).toEqual(['@jinwoo']);
  }, 30_000);

  it('returns an image-safe 404 for unknown handles', async () => {
    const res = await get('?handle=nobody_here');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60, stale-while-revalidate=300');
    expect(await pngSize(res)).toEqual({ width: 1080, height: 1920 });
  }, 30_000);

  it.each([
    ['missing handle', ''],
    ['too short', '?handle=a'],
    ['too long', `?handle=${'a'.repeat(50)}`],
    ['bad characters', '?handle=a%20b'],
    ['path traversal', '?handle=..%2F..%2Fetc'],
    ['double @', '?handle=%40%40ab'],
    ['unknown format', '?handle=jinwoo&format=banner'],
    ['non-numeric version', '?handle=jinwoo&v=abc'],
  ])('rejects invalid input (%s) with 400 without touching the database', async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('image/png');
    await pngSize(res);
    expect(repo.publicProfileCalls).toEqual([]);
  }, 30_000);

  it('returns 503 (no-store) when the database is not configured', async () => {
    h.repo = null;
    const res = await get('?handle=jinwoo');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('image/png');
  }, 30_000);

  it('returns 500 (no-store) when the repository fails, without leaking the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    repo.failWith = new Error('db exploded: secret detail');
    const res = await get('?handle=jinwoo');
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.includes('secret detail')).toBe(false);
  }, 30_000);
});
