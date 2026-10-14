/**
 * PGlite tests for supabase/migrations/20261014100000_onboarding.sql: enums match the shared
 * constants, existing users are backfilled as onboarded exactly once, new sign-ups start
 * un-onboarded, API roles can read but never write the new columns, and re-applying is safe.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FITNESS_GOALS, FITNESS_LEVELS } from '../src/onboarding';
import { MIGRATIONS, SUPABASE_STUB, as, attempt } from './pglite-helpers';

const ONBOARDING_FILE = '20261014100000_onboarding.sql';
const EXISTING = '11111111-1111-4111-8111-111111111111';
const NEW_USER = '22222222-2222-4222-8222-222222222222';
const LATE_USER = '33333333-3333-4333-8333-333333333333';

let db: PGlite;

async function exec(files: ReadonlyArray<{ file: string; sql: string }>) {
  for (const m of files) {
    try {
      await db.exec(m.sql);
    } catch (e) {
      throw new Error(`${m.file}: ${(e as Error).message}`);
    }
  }
}

async function onboardedAt(authId: string): Promise<string | null> {
  await as(db, null);
  const { rows } = await db.query<{ onboarded_at: string | null }>(`SELECT onboarded_at FROM profiles WHERE auth_id = $1`, [authId]);
  return rows[0]?.onboarded_at ?? null;
}

const idx = MIGRATIONS.findIndex((m) => m.file === ONBOARDING_FILE);
const before = MIGRATIONS.slice(0, idx);
const fromOnboarding = MIGRATIONS.slice(idx);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  // A database that is live before onboarding ships, with one real user.
  await exec(before);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${EXISTING}', 'existing@example.com')`);
  await exec(fromOnboarding);
  // Signs up after the migration.
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${NEW_USER}', 'new@example.com')`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('onboarding migration', () => {
  it('is present and ordered after the starter library', () => {
    expect(idx).toBeGreaterThan(0);
    expect(MIGRATIONS[idx - 1].file).toBe('20261014090000_starter_library.sql');
  });

  it('enums match FITNESS_GOALS / FITNESS_LEVELS', async () => {
    await as(db, null);
    const labels = async (t: string) =>
      (
        await db.query<{ label: string }>(
          `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typname = $1 ORDER BY e.enumsortorder`,
          [t],
        )
      ).rows.map((r) => r.label);
    expect(await labels('fitness_goal_enum')).toEqual([...FITNESS_GOALS]);
    expect(await labels('fitness_level_enum')).toEqual([...FITNESS_LEVELS]);
  });

  it('adds nullable columns with the right types', async () => {
    await as(db, null);
    const { rows } = await db.query<{ column_name: string; udt_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT column_name, udt_name, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name IN ('fitness_goal', 'fitness_level', 'onboarded_at') ORDER BY column_name`,
    );
    expect(rows).toEqual([
      { column_name: 'fitness_goal', udt_name: 'fitness_goal_enum', is_nullable: 'YES', column_default: null },
      { column_name: 'fitness_level', udt_name: 'fitness_level_enum', is_nullable: 'YES', column_default: null },
      { column_name: 'onboarded_at', udt_name: 'timestamptz', is_nullable: 'YES', column_default: null },
    ]);
  });

  it('backfills users that existed when the migration ran; new sign-ups start un-onboarded', async () => {
    expect(await onboardedAt(EXISTING)).not.toBeNull();
    expect(await onboardedAt(NEW_USER)).toBeNull();
    const { rows } = await db.query<{ onboarded_at: string | null }>(`SELECT onboarded_at FROM profiles WHERE handle = '@aurafit'`);
    expect(rows[0].onboarded_at).not.toBeNull(); // system profile existed too
  });

  it('re-applying the migration does not re-backfill (late sign-ups stay un-onboarded)', async () => {
    await as(db, null);
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${LATE_USER}', 'late@example.com')`);
    const existingBefore = await onboardedAt(EXISTING);
    await exec(fromOnboarding);
    await exec(fromOnboarding);
    expect(await onboardedAt(LATE_USER)).toBeNull();
    expect(await onboardedAt(NEW_USER)).toBeNull();
    expect(await onboardedAt(EXISTING)).toEqual(existingBefore);
  });

  it('rejects values outside the enums', async () => {
    await as(db, null);
    expect((await attempt(db, `UPDATE profiles SET fitness_goal = 'GET_HUGE' WHERE auth_id = $1`, [NEW_USER])).error).toMatch(/invalid input value/);
    expect((await attempt(db, `UPDATE profiles SET fitness_level = 'GOD' WHERE auth_id = $1`, [NEW_USER])).error).toMatch(/invalid input value/);
  });
});

describe('onboarding column privileges', () => {
  it.each(['anon', 'authenticated'] as const)('%s can read goal, level and onboarded_at (auth_id stays hidden)', async (role) => {
    await as(db, role, NEW_USER);
    const r = await attempt(db, `SELECT id, fitness_goal, fitness_level, onboarded_at FROM profiles`);
    expect(r.error).toBeUndefined();
    expect(r.rows.length).toBeGreaterThan(0);
    expect((await attempt(db, `SELECT auth_id FROM profiles`)).error).toMatch(/permission denied/);
    await as(db, null);
  });

  it('authenticated users cannot set onboarded_at, goal or level on their own row', async () => {
    await as(db, null);
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM profiles WHERE auth_id = $1`, [NEW_USER]);
    const id = rows[0].id;
    await as(db, 'authenticated', NEW_USER);
    for (const sql of [
      `UPDATE profiles SET onboarded_at = now() WHERE id = $1`,
      `UPDATE profiles SET fitness_goal = 'GET_FIT' WHERE id = $1`,
      `UPDATE profiles SET fitness_level = 'BEGINNER' WHERE id = $1`,
    ]) {
      expect((await attempt(db, sql, [id])).error).toMatch(/permission denied/);
    }
    // Cosmetic columns are still editable (existing grants untouched).
    expect((await attempt(db, `UPDATE profiles SET username = 'Renamed' WHERE id = $1 RETURNING id`, [id])).rows).toHaveLength(1);
    expect(await onboardedAt(NEW_USER)).toBeNull();
  });

  it('anon cannot write the new columns either', async () => {
    await as(db, 'anon');
    expect((await attempt(db, `UPDATE profiles SET onboarded_at = now()`)).error).toMatch(/permission denied/);
    await as(db, null);
  });

  it('service_role (the API server) can complete onboarding', async () => {
    await as(db, 'service_role');
    const r = await attempt(
      db,
      `UPDATE profiles SET fitness_goal = 'BUILD_HABIT', fitness_level = 'BEGINNER', onboarded_at = now()
        WHERE auth_id = $1 RETURNING fitness_goal, fitness_level, onboarded_at IS NOT NULL AS done`,
      [NEW_USER],
    );
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([{ fitness_goal: 'BUILD_HABIT', fitness_level: 'BEGINNER', done: true }]);
    await as(db, null);
  });
});
