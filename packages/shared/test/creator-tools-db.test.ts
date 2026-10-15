/**
 * PGlite tests for supabase/migrations/20261014130000_creator_tools.sql: scheduled publishing
 * (publish_at + restrictive RLS + horizon trigger), creator edit/delete permissions through RLS,
 * drop deletion keeping athletes' ledgers, creator_follows constraints / privileges, the server-only
 * follow functions and creator_analytics aggregation.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as as asRole, attempt as tryQuery, createDb, type DbRole } from './pglite-helpers';

let db: PGlite;
const as = (role: DbRole, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

type Result = Record<string, unknown> & { status: string };

let seq = 0;
async function user(name: string, role: 'MEMBER' | 'CREATOR' | 'ADMIN' = 'MEMBER'): Promise<{ authId: string; id: string }> {
  await as(null);
  seq += 1;
  const authId = `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`;
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [authId, `${name}${seq}@example.com`]);
  await db.query(`UPDATE profiles SET role = $2 WHERE auth_id = $1`, [authId, role]);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM profiles WHERE auth_id = $1`, [authId]);
  return { authId, id: rows[0].id };
}

async function call(sql: string, params: unknown[] = []): Promise<Result> {
  await as('service_role');
  const { rows } = await db.query<{ r: Result }>(`SELECT ${sql} AS r`, params);
  await as(null);
  return rows[0].r;
}

async function drop(id: string, creatorId: string, publishAt: string | null = null) {
  await as(null);
  await db.query(
    `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate, publish_at)
     VALUES ($1, $1, $2, 'V', 10, 50, $3)`,
    [id, creatorId, publishAt],
  );
}

async function log(userId: string, dropId: string, completedAt: string, aura = 100) {
  await as(null);
  await db.query(
    `INSERT INTO user_workout_logs (user_id, drop_id, aura_earned, completed_at, date_key)
     VALUES ($1, $2, $3, $4, ($4::timestamptz AT TIME ZONE 'UTC')::date)`,
    [userId, dropId, aura, completedAt],
  );
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  db = await createDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await as(null);
  await db.exec(`DELETE FROM auth.users; DELETE FROM workout_drops WHERE id NOT LIKE 'af\\_%';`);
});

describe('scheduled publishing (publish_at)', () => {
  it('hides scheduled drops from anon and other users; the creator and admins see them', async () => {
    const creator = await user('creator', 'CREATOR');
    const member = await user('member');
    const admin = await user('admin', 'ADMIN');
    await drop('drop_live', creator.id);
    await drop('drop_past', creator.id, '2020-01-01T00:00:00Z');
    await drop('drop_sched', creator.id, future(3));

    const visible = async (role: DbRole, sub = '') => {
      await as(role, sub);
      const { rows } = await db.query<{ id: string }>(`SELECT id FROM workout_drops WHERE creator_id = $1 ORDER BY id`, [creator.id]);
      await as(null);
      return rows.map((r) => r.id);
    };
    expect(await visible('anon')).toEqual(['drop_live', 'drop_past']);
    expect(await visible('authenticated', member.authId)).toEqual(['drop_live', 'drop_past']);
    expect(await visible('authenticated', creator.authId)).toEqual(['drop_live', 'drop_past', 'drop_sched']);
    expect(await visible('authenticated', admin.authId)).toEqual(['drop_live', 'drop_past', 'drop_sched']);
  });

  it('the public select policy is restrictive (ANDs with permissive policies)', async () => {
    await as(null);
    const { rows } = await db.query<{ polname: string; permissive: string; roles: string }>(
      `SELECT policyname AS polname, permissive, roles::text AS roles FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'workout_drops' AND cmd = 'SELECT' ORDER BY policyname`,
    );
    const restrictive = rows.filter((r) => r.permissive === 'RESTRICTIVE').map((r) => r.polname);
    // Other migrations (e.g. 20261014140000_moderation.sql) add their own restrictive policies; they all AND together.
    expect(restrictive).toEqual(expect.arrayContaining(['Scheduled drops hidden from anon', 'Scheduled drops visible to their creator and admins']));
  });

  it('rejects schedules more than 60 days ahead (trigger) and clients cannot set publish_at', async () => {
    const creator = await user('creator', 'CREATOR');
    await drop('drop_ok', creator.id, future(59));
    await as(null);
    const far = await attempt(
      `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate, publish_at)
       VALUES ('drop_far', 'x', $1, 'V', 10, 50, $2)`,
      [creator.id, future(70)],
    );
    expect(far.error).toMatch(/60 days/);

    await as('authenticated', creator.authId);
    const r = await attempt(`UPDATE workout_drops SET publish_at = NOW() + INTERVAL '1 day' WHERE id = 'drop_ok'`);
    expect(r.error).toMatch(/permission denied/);
    await as(null);
  });
});

describe('creator edit/delete permissions (RLS)', () => {
  it('a creator edits and deletes only their own drops; system af_* drops are not editable by creators', async () => {
    const a = await user('a', 'CREATOR');
    const b = await user('b', 'CREATOR');
    await drop('drop_a', a.id);
    await as(null);
    await db.exec(`UPDATE workout_drops SET likes_count = 7, completions_count = 9 WHERE id = 'drop_a'`);

    await as('authenticated', b.authId);
    const other = await db.query(`UPDATE workout_drops SET title = 'hijack' WHERE id = 'drop_a' RETURNING id`);
    expect(other.rows).toHaveLength(0);
    const sys = await db.query(`UPDATE workout_drops SET title = 'hijack' WHERE id = 'af_first_quest_fullbody' RETURNING id`);
    expect(sys.rows).toHaveLength(0);
    expect((await db.query(`DELETE FROM workout_drops WHERE id = 'drop_a' RETURNING id`)).rows).toHaveLength(0);
    // Counters are not client-writable even by the owner.
    await as('authenticated', a.authId);
    expect((await attempt(`UPDATE workout_drops SET likes_count = 999 WHERE id = 'drop_a'`)).error).toMatch(/permission denied/);
    const own = await db.query<{ title: string; likes_count: number; completions_count: number }>(
      `UPDATE workout_drops SET title = 'Edited' WHERE id = 'drop_a' RETURNING title, likes_count, completions_count`,
    );
    expect(own.rows[0]).toEqual({ title: 'Edited', likes_count: 7, completions_count: 9 });
    expect((await db.query(`DELETE FROM workout_drops WHERE id = 'drop_a' RETURNING id`)).rows).toHaveLength(1);
    await as(null);
  });

  it('deleting a drop keeps athletes’ ledger rows (drop_id becomes NULL), so their aura history survives', async () => {
    const creator = await user('creator', 'CREATOR');
    const member = await user('member');
    await drop('drop_gone', creator.id);
    await log(member.id, 'drop_gone', new Date().toISOString(), 123);
    await as(null);
    await db.exec(`DELETE FROM workout_drops WHERE id = 'drop_gone'`);
    const { rows } = await db.query<{ drop_id: string | null; aura_earned: number }>(
      `SELECT drop_id, aura_earned FROM user_workout_logs WHERE user_id = $1`,
      [member.id],
    );
    expect(rows).toEqual([{ drop_id: null, aura_earned: 123 }]);
  });
});

describe('creator_follows', () => {
  it('enforces unique pairs, no self-follow, and creator/admin-only targets', async () => {
    const creator = await user('creator', 'CREATOR');
    const admin = await user('admin', 'ADMIN');
    const member = await user('member');
    const other = await user('other');
    await as(null);
    await db.query(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, creator.id]);
    await db.query(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, admin.id]);
    expect((await attempt(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, creator.id])).error).toMatch(/duplicate key/);
    expect((await attempt(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $1)`, [creator.id])).error).toMatch(/creator_follows_not_self/);
    expect((await attempt(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, other.id])).error).toMatch(
      /only creator profiles/,
    );
  });

  it('is invisible and unwritable for anon/authenticated (server-only)', async () => {
    const creator = await user('creator', 'CREATOR');
    const member = await user('member');
    await as(null);
    await db.query(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, creator.id]);
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role, member.authId);
      expect((await attempt(`SELECT * FROM creator_follows`)).error).toMatch(/permission denied/);
      expect((await attempt(`INSERT INTO creator_follows (follower_id, creator_id) VALUES ($1, $2)`, [member.id, creator.id])).error).toMatch(
        /permission denied/,
      );
      expect((await attempt(`SELECT public.follow_creator($1, $2)`, [member.id, creator.id])).error).toMatch(/permission denied/);
      expect((await attempt(`SELECT public.creator_analytics($1)`, [creator.id])).error).toMatch(/permission denied/);
    }
    await as(null);
    const rls = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.creator_follows'::regclass`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });

  it('follow_creator / unfollow_creator return statuses and computed follower counts; deleting either profile cascades', async () => {
    const creator = await user('creator', 'CREATOR');
    const m1 = await user('m1');
    const m2 = await user('m2');
    expect(await call(`public.follow_creator($1, $2)`, [m1.id, creator.id])).toEqual({ status: 'followed', follower_count: 1 });
    expect(await call(`public.follow_creator($1, $2)`, [m1.id, creator.id])).toEqual({ status: 'already_following', follower_count: 1 });
    expect(await call(`public.follow_creator($1, $2)`, [m2.id, creator.id])).toEqual({ status: 'followed', follower_count: 2 });
    expect((await call(`public.follow_creator($1, $2)`, [creator.id, creator.id])).status).toBe('cannot_follow_self');
    expect((await call(`public.follow_creator($1, $2)`, [m1.id, m2.id])).status).toBe('creator_not_found');
    expect((await call(`public.follow_creator($1, gen_random_uuid())`, [m1.id])).status).toBe('creator_not_found');
    expect((await call(`public.follow_creator(gen_random_uuid(), $1)`, [creator.id])).status).toBe('profile_not_found');
    expect(await call(`public.unfollow_creator($1, $2)`, [m1.id, creator.id])).toEqual({ status: 'unfollowed', follower_count: 1 });
    expect(await call(`public.unfollow_creator($1, $2)`, [m1.id, creator.id])).toEqual({ status: 'not_following', follower_count: 1 });

    await as(null);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [m2.authId]);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM creator_follows`);
    expect(rows[0].n).toBe(0);
  });
});

describe('creator_analytics', () => {
  it('aggregates completions, unique athletes, aura and a zero-filled daily series; excludes self and other creators', async () => {
    const creator = await user('creator', 'CREATOR');
    const rival = await user('rival', 'CREATOR');
    const a1 = await user('a1');
    const a2 = await user('a2');
    await drop('drop_one', creator.id);
    await drop('drop_two', creator.id);
    await drop('drop_soon', creator.id, future(5));
    await drop('drop_rival', rival.id);
    await call(`public.follow_creator($1, $2)`, [a1.id, creator.id]);

    const now = '2026-10-14T12:00:00Z';
    await log(a1.id, 'drop_one', '2026-10-14T08:00:00Z', 100);
    await log(a1.id, 'drop_one', '2026-10-13T08:00:00Z', 100);
    await log(a2.id, 'drop_one', '2026-10-13T09:00:00Z', 50);
    await log(a2.id, 'drop_two', '2026-10-08T23:59:00Z', 70); // first day of the 7d window
    await log(a2.id, 'drop_two', '2026-10-07T23:59:00Z', 999); // outside 7d, inside 30d
    await log(creator.id, 'drop_one', '2026-10-14T09:00:00Z', 100); // self: excluded
    await log(a1.id, 'drop_rival', '2026-10-14T09:00:00Z', 100); // someone else's drop

    const r = await call(`public.creator_analytics($1, 7, $2::timestamptz)`, [creator.id, now]);
    expect(r.status).toBe('ok');
    expect(r.from).toBe('2026-10-08');
    expect(r.to).toBe('2026-10-14');
    expect(r.totals).toEqual({ followers: 1, live_drops: 2, scheduled_drops: 1, completions: 4, unique_athletes: 2, aura_awarded: 320 });
    const series = r.series as Array<{ date: string; completions: number }>;
    expect(series).toHaveLength(7);
    expect(series.map((p) => p.completions)).toEqual([1, 0, 0, 0, 0, 2, 1]);
    const drops = r.drops as Array<Record<string, unknown>>;
    expect(drops.map((d) => d.drop_id)).toEqual(['drop_one', 'drop_two', 'drop_soon']);
    expect(drops[0]).toMatchObject({ completions: 3, unique_athletes: 2, last_completed_on: '2026-10-14' });
    expect(drops[2]).toMatchObject({ completions: 0, unique_athletes: 0, last_completed_on: null });
    // Aggregates only: no athlete identifiers anywhere in the payload.
    const text = JSON.stringify(r);
    for (const id of [a1.id, a2.id]) expect(text).not.toContain(id);

    const month = await call(`public.creator_analytics($1, 30, $2::timestamptz)`, [creator.id, now]);
    expect((month.series as unknown[]).length).toBe(30);
    expect((month.totals as Record<string, number>).completions).toBe(5);
    expect((month.totals as Record<string, number>).aura_awarded).toBe(1319);

    expect((await call(`public.creator_analytics(gen_random_uuid(), 7)`)).status).toBe('profile_not_found');
  });
});
