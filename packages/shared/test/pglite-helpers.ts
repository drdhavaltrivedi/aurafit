/**
 * Shared PGlite harness: a minimal stub of Supabase's `auth` schema, roles and
 * default privileges, so schema.sql can be executed against real PostgreSQL (WASM).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export const SCHEMA_PATH = join(__dirname, '..', 'schema.sql');
export const SCHEMA = readFileSync(SCHEMA_PATH, 'utf8');

export const SUPABASE_STUB = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  -- Mirror Supabase's default privileges (verified on a live project): ALL on
  -- tables and EXECUTE on functions for every API role. The schema must narrow them.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // must be idempotent
  return db;
}

export type DbRole = 'authenticated' | 'anon' | 'service_role' | null;

export async function as(db: PGlite, role: DbRole, sub = ''): Promise<void> {
  await db.exec(role ? `RESET ROLE; SET ROLE ${role};` : 'RESET ROLE;');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub]);
}

export async function attempt(db: PGlite, sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; error?: string }> {
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
}
