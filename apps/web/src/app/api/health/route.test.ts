import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../../../package.json';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('returns ok, version and no-store', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe(packageJson.version);
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.services.web).toBe('operational');
  });

  it('does not claim a database connection when none is configured', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const body = await (await GET()).json();
    expect(body.services.database).toBe('not_configured');
    expect(JSON.stringify(body)).not.toContain('connected');
  });

  it('reports database as configured (not connected) when env is present', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    const body = await (await GET()).json();
    expect(body.services.database).toBe('configured');
  });

  it('does not leak env values', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:secret@db/aurafit');
    const text = await (await GET()).text();
    expect(text).not.toContain('secret');
  });
});
