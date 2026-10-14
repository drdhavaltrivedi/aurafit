/**
 * PGlite tests for supabase/migrations/20261013130000_launch_hardening.sql:
 * auth_id hidden from the Data API roles (RLS still works), the merged profiles
 * UPDATE policy, the weekly aura reset, and the account-deletion cascade.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as as asRole, attempt as tryQuery, createDb, type DbRole } from './pglite-helpers';

const MEMBER = '11111111-1111-4111-8111-111111111111';
const CREATOR = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

let db: PGlite;
const as = (role: DbRole, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

async function profileId(authId: string): Promise<string> {
  await as(null);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM profiles WHERE auth_id = $1`, [authId]);
  return rows[0].id;
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${MEMBER}', 'member@example.com'),
      ('${CREATOR}', 'creator@example.com'),
      ('${ADMIN}', 'admin@example.com');
    UPDATE profiles SET role = 'CREATOR' WHERE auth_id = '${CREATOR}';
    UPDATE profiles SET role = 'ADMIN' WHERE auth_id = '${ADMIN}';
    INSERT INTO user_quest_logs (user_id, quest_id, aura_earned) SELECT id, 'q_daily_1', 250 FROM profiles WHERE auth_id IS NOT NULL;
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('profiles.auth_id is not exposed to API roles', () => {
  it.each(['anon', 'authenticated'] as const)('%s: can read public columns but not auth_id (nor select *)', async (role) => {
    await as(role, MEMBER);
    expect((await attempt(`SELECT id, handle, username, role, aura_points, rank, weekly_aura_gained, created_at FROM profiles WHERE handle <> '@aurafit'`)).rows).toHaveLength(3);
    expect((await attempt(`SELECT auth_id FROM profiles`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT * FROM profiles`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT id FROM profiles WHERE auth_id = $1`, [MEMBER])).error).toMatch(/permission denied/);
    await as(null);
  });

  it('service_role can still read auth_id (server-side profile lookup)', async () => {
    await as('service_role');
    expect((await attempt(`SELECT id FROM profiles WHERE auth_id = $1`, [MEMBER])).rows).toHaveLength(1);
    await as(null);
  });

  it('RLS policies that depend on auth_id still work for authenticated users', async () => {
    await as('authenticated', MEMBER);
    expect((await attempt(`SELECT user_id FROM user_quest_logs`)).rows).toEqual([{ user_id: await profileId(MEMBER) }]);
    await as('authenticated', MEMBER);
    expect((await attempt(`SELECT id FROM user_workout_logs`)).error).toBeUndefined();
    expect((await attempt(`UPDATE profiles SET bio = 'mine' RETURNING handle`)).rows).toEqual([{ handle: '@member' }]);
    await as('authenticated', ADMIN);
    expect((await attempt(`SELECT count(*)::int AS n FROM user_quest_logs`)).rows).toEqual([{ n: 3 }]);
    await as(null);
  });

  it('private.current_profile_id() resolves the caller and is not callable by anon', async () => {
    await as('authenticated', CREATOR);
    expect((await db.query<{ id: string }>(`SELECT private.current_profile_id() AS id`)).rows[0].id).toBe(await profileId(CREATOR));
    await as('authenticated', '');
    expect((await db.query<{ id: string | null }>(`SELECT private.current_profile_id() AS id`)).rows[0].id).toBeNull();
    await as('anon');
    expect((await attempt(`SELECT private.current_profile_id()`)).error).toMatch(/permission denied/);
    await as(null);
  });
});

describe('profiles UPDATE policy (merged)', () => {
  it('there is exactly one permissive UPDATE policy on profiles', async () => {
    await as(null);
    const { rows } = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'UPDATE' AND permissive = 'PERMISSIVE'`,
    );
    expect(rows.map((r) => r.policyname)).toEqual(['Users update own profile; admins any']);
  });

  it('members update only their own row; admins any row; column grants still apply', async () => {
    await as('authenticated', MEMBER);
    expect((await attempt(`UPDATE profiles SET bio = 'pwned' WHERE handle = '@creator' RETURNING id`)).rows).toHaveLength(0);
    await as('authenticated', ADMIN);
    expect((await attempt(`UPDATE profiles SET title = 'Moderated' WHERE handle = '@creator' RETURNING id`)).rows).toHaveLength(1);
    expect((await attempt(`UPDATE profiles SET role = 'ADMIN' WHERE handle = '@member'`)).error).toMatch(/permission denied/);
    await as(null);
  });
});

describe('workout_drops policies (rewritten on private helpers)', () => {
  const insert = (id: string, handle: string) =>
    attempt(
      `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate)
       SELECT $1, 't', id, 'v', 5, 50 FROM profiles WHERE handle = $2`,
      [id, handle],
    );

  it('creators publish/update/delete only their own drops; members cannot publish; admins delete any', async () => {
    await as('authenticated', MEMBER);
    expect((await insert('drop_m', '@member')).error).toMatch(/row-level security/);
    await as('authenticated', CREATOR);
    expect((await insert('drop_c', '@creator')).error).toBeUndefined();
    expect((await insert('drop_x', '@member')).error).toMatch(/row-level security/);
    expect((await attempt(`UPDATE workout_drops SET title = 'mine' WHERE id = 'drop_c' RETURNING id`)).rows).toHaveLength(1);
    await as('authenticated', MEMBER);
    expect((await attempt(`UPDATE workout_drops SET title = 'x' WHERE id = 'drop_c' RETURNING id`)).rows).toHaveLength(0);
    expect((await attempt(`DELETE FROM workout_drops WHERE id = 'drop_c' RETURNING id`)).rows).toHaveLength(0);
    await as('authenticated', ADMIN);
    expect((await insert('drop_a', '@admin')).error).toBeUndefined();
    expect((await attempt(`DELETE FROM workout_drops WHERE id = 'drop_a' RETURNING id`)).rows).toHaveLength(1);
    await as(null);
  });
});

describe('weekly aura reset', () => {
  it('private.reset_weekly_aura() zeroes weekly_aura_gained only and reports the rows changed', async () => {
    await as(null);
    await db.exec(`UPDATE profiles SET weekly_aura_gained = 700, aura_points = 900 WHERE auth_id IN ('${MEMBER}', '${CREATOR}')`);
    await as('service_role');
    expect((await db.query<{ n: number }>(`SELECT private.reset_weekly_aura() AS n`)).rows[0].n).toBe(2);
    expect((await db.query<{ n: number }>(`SELECT private.reset_weekly_aura() AS n`)).rows[0].n).toBe(0);
    await as(null);
    const { rows } = await db.query<{ w: string; a: string }>(`SELECT weekly_aura_gained::text AS w, aura_points::text AS a FROM profiles WHERE auth_id = $1`, [MEMBER]);
    expect(rows[0]).toEqual({ w: '0', a: '900' });
  });

  it.each(['anon', 'authenticated'] as const)('%s cannot execute the reset', async (role) => {
    await as(role, MEMBER);
    expect((await attempt(`SELECT private.reset_weekly_aura()`)).error).toMatch(/permission denied/);
    await as(null);
  });

  it('migration tolerates a missing pg_cron (no cron schema created here)', async () => {
    await as(null);
    const { rows } = await db.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'cron'`);
    expect(rows).toHaveLength(0);
  });
});

describe('account deletion cascade (auth.users row deleted)', () => {
  it('removes the profile, its logs and drops (incl. other users’ logs of those drops); squad leadership passes on', async () => {
    await as(null);
    const creatorId = await profileId(CREATOR);
    const memberId = await profileId(MEMBER);
    await db.exec(`
      INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate)
        VALUES ('drop_gone', 'Gone', '${creatorId}', 'v', 5, 50);
      INSERT INTO user_workout_logs (user_id, drop_id, aura_earned) VALUES ('${creatorId}', 'drop_gone', 10), ('${memberId}', 'drop_gone', 10);
      INSERT INTO squads (name, tag, leader_id) VALUES ('Shadow Army', 'SHDW', '${creatorId}');
      UPDATE profiles SET squad_id = (SELECT id FROM squads WHERE tag = 'SHDW') WHERE id IN ('${creatorId}', '${memberId}');
    `);

    await db.exec(`DELETE FROM auth.users WHERE id = '${CREATOR}'`);

    const count = async (sql: string) => (await db.query<{ n: number }>(sql)).rows[0].n;
    expect(await count(`SELECT count(*)::int AS n FROM profiles WHERE id = '${creatorId}'`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM user_quest_logs WHERE user_id = '${creatorId}'`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM user_workout_logs WHERE user_id = '${creatorId}'`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM workout_drops WHERE creator_id = '${creatorId}'`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM user_workout_logs WHERE drop_id = 'drop_gone'`)).toBe(0);
    // The squad keeps going with its remaining member as leader (20261014120000_squads.sql trigger).
    const squad = await db.query<{ leader_id: string | null }>(`SELECT leader_id FROM squads WHERE tag = 'SHDW'`);
    expect(squad.rows[0].leader_id).toBe(memberId);
    // Other users keep their profile, aura and squad membership.
    expect(await count(`SELECT count(*)::int AS n FROM profiles WHERE id = '${memberId}' AND squad_id IS NOT NULL`)).toBe(1);
  });
});
