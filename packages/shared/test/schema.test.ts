/**
 * Applies every migration in supabase/migrations (in order, twice for idempotency)
 * against a real (WASM) PostgreSQL via PGlite, with a minimal stub of Supabase's
 * `auth` schema and roles, then checks constraints, RLS and column privileges.
 */
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRankFromAura, INITIAL_QUESTS, MAX_AURA_PER_ACTION, RANK_ORDER, RANK_THRESHOLDS } from '../src/index';
import { as as asRole, attempt as tryQuery, bundleMigrations, createDb, MIGRATIONS, SCHEMA_PATH } from './pglite-helpers';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

let db: PGlite;
const as = (role: 'authenticated' | 'anon' | null, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

beforeAll(async () => {
  db = await createDb();
  // Profiles are created by the on_auth_user_created trigger.
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${MEMBER}', 'jinwoo_leveling@example.com'),
      ('${OTHER}', 'other@example.com');
    UPDATE profiles SET aura_points = 8450 WHERE auth_id = '${MEMBER}';
    INSERT INTO user_quest_logs (user_id, quest_id, aura_earned) SELECT id, 'q_daily_1', 250 FROM profiles;
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations (cumulative schema)', () => {
  it('rank_for_aura() matches getRankFromAura at every threshold boundary', async () => {
    await as(null);
    const samples = RANK_ORDER.flatMap((r) => [RANK_THRESHOLDS[r] - 1, RANK_THRESHOLDS[r]]).filter((n) => n >= 0);
    for (const aura of samples) {
      const { rows } = await db.query<{ rank: string }>('SELECT rank_for_aura($1) AS rank', [aura]);
      expect(rows[0].rank, `aura ${aura}`).toBe(getRankFromAura(aura).rank);
    }
  });

  it('derives profiles.rank from aura_points and ignores manual rank writes', async () => {
    await as(null);
    const { rows } = await db.query<{ rank: string }>(`SELECT rank FROM profiles WHERE handle = '@jinwoo_leveling'`);
    expect(rows[0].rank).toBe('B-RANK');
    await db.exec(`UPDATE profiles SET rank = 'MONARCH' WHERE handle = '@other'`);
    const after = await db.query<{ rank: string }>(`SELECT rank FROM profiles WHERE handle = '@other'`);
    expect(after.rows[0].rank).toBe('E-RANK');
  });

  it('enforces CHECK constraints', async () => {
    await as(null);
    expect((await attempt(`UPDATE profiles SET aura_points = -1`)).error).toMatch(/aura_points_check/);
    expect((await attempt(`UPDATE profiles SET str_stat = 101`)).error).toMatch(/str_stat_check/);
    expect((await attempt(`UPDATE profiles SET handle = 'no-at-sign' WHERE handle = '@other'`)).error).toMatch(/handle_check/);
    const overCap = await attempt(
      `INSERT INTO user_quest_logs (user_id, quest_id, aura_earned, date_key)
       SELECT id, 'q_daily_1', $1, '2020-01-01' FROM profiles LIMIT 1`,
      [MAX_AURA_PER_ACTION + 1]
    );
    expect(overCap.error).toMatch(/aura_earned_check/);
  });

  it('enforces FK from profiles.squad_id to squads', async () => {
    await as(null);
    const r = await attempt(`UPDATE profiles SET squad_id = gen_random_uuid() WHERE handle = '@other'`);
    expect(r.error).toMatch(/foreign key/);
  });

  it('enables RLS on every public table', async () => {
    await as(null);
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`
    );
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) expect(r.relrowsecurity, r.relname).toBe(true);
  });

  it('quest logs are private to their owner (not readable by others or anon)', async () => {
    await as('authenticated', MEMBER);
    const own = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM user_quest_logs`);
    expect(own.rows[0].n).toBe(1);
    await as('anon');
    expect((await attempt(`SELECT count(*) FROM user_quest_logs`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT count(*) FROM user_workout_logs`)).error).toMatch(/permission denied/);
  });

  it('clients cannot TRUNCATE (which would bypass RLS) any table', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role, MEMBER);
      for (const t of ['profiles', 'quests', 'user_quest_logs', 'user_workout_logs', 'workout_drops', 'squads', 'gym_leaderboard']) {
        expect((await attempt(`TRUNCATE ${t} CASCADE`)).error, `${role} ${t}`).toMatch(/permission denied/);
      }
    }
    await as(null);
  });

  it('packages/shared/schema.sql is the concatenation of all migrations', () => {
    expect(MIGRATIONS.map((m) => m.file)[0]).toBe('20261013120000_aurafit_init.sql');
    expect(readFileSync(SCHEMA_PATH, 'utf8'), 'run `npm run db:sync`').toBe(bundleMigrations());
  });

  it('seeds the quest catalog from INITIAL_QUESTS', async () => {
    await as(null);
    const { rows } = await db.query<{ id: string; aura_reward: number; stat_reward_stat: string; stat_reward_amount: number; target_count: number }>(
      `SELECT id, aura_reward, stat_reward_stat, stat_reward_amount, target_count FROM quests ORDER BY id`
    );
    const expected = [...INITIAL_QUESTS]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((q) => ({ id: q.id, aura_reward: q.auraReward, stat_reward_stat: q.statReward.stat, stat_reward_amount: q.statReward.amount, target_count: q.targetCount }));
    expect(rows).toEqual(expected);
  });

  it('users cannot self-award aura, promote themselves, or insert quest logs', async () => {
    await as('authenticated', MEMBER);
    expect((await attempt(`UPDATE profiles SET role = 'ADMIN' WHERE handle = '@jinwoo_leveling'`)).error).toMatch(/permission denied/);
    expect((await attempt(`UPDATE profiles SET aura_points = 99999 WHERE handle = '@jinwoo_leveling'`)).error).toMatch(/permission denied/);
    expect(
      (await attempt(`INSERT INTO user_quest_logs (user_id, quest_id, aura_earned) SELECT id, 'q_daily_1', 1 FROM profiles LIMIT 1`)).error
    ).toMatch(/permission denied/);
  });

  it('users can edit cosmetic fields of their own profile only', async () => {
    await as('authenticated', MEMBER);
    expect((await attempt(`UPDATE profiles SET bio = 'locked in' WHERE handle = '@jinwoo_leveling' RETURNING id`)).rows).toHaveLength(1);
    expect((await attempt(`UPDATE profiles SET bio = 'pwned' WHERE handle = '@other' RETURNING id`)).rows).toHaveLength(0);
    // Without a WHERE clause only the caller's own row matches.
    expect((await attempt(`UPDATE profiles SET title = 'Locked in' RETURNING handle`)).rows).toEqual([{ handle: '@jinwoo_leveling' }]);
  });

  it('only creators/admins can publish workout drops', async () => {
    const insert = `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate)
                    SELECT 'drop_test', 't', id, 'v', 5, 50 FROM profiles WHERE handle = $1`;
    await as('authenticated', MEMBER);
    expect((await attempt(insert, ['@jinwoo_leveling'])).error).toMatch(/row-level security/);
    await as(null);
    await db.exec(`UPDATE profiles SET role = 'CREATOR' WHERE auth_id = '${MEMBER}'`);
    await as('authenticated', MEMBER);
    expect((await attempt(insert, ['@jinwoo_leveling'])).error).toBeUndefined();
    // ...but never on behalf of another profile.
    expect((await attempt(insert.replace('drop_test', 'drop_test2'), ['@other'])).error).toMatch(/row-level security/);
    expect((await attempt(`UPDATE workout_drops SET title = 'renamed' WHERE id = 'drop_test' RETURNING id`)).rows).toHaveLength(1);
    expect((await attempt(`UPDATE workout_drops SET likes_count = 1000000`)).error).toMatch(/permission denied/);
  });

  it('catalog tables are publicly readable but not writable by clients', async () => {
    await as('anon');
    expect((await db.query(`SELECT id FROM quests`)).rows).toHaveLength(INITIAL_QUESTS.length);
    expect((await attempt(`INSERT INTO gym_leaderboard (gym_name, city) VALUES ('x', 'y')`)).error).toMatch(/permission denied/);
    await as(null);
  });
});
