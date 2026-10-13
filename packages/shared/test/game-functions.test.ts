/**
 * PGlite tests for the signup trigger, the streak rule (SQL vs TypeScript parity),
 * the server-only game action functions, and the optional demo drop seed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDailyStreak, INITIAL_WORKOUT_DROPS, MAX_AURA_PER_SYNC } from '../src/index';
import { as, attempt, createDb } from './pglite-helpers';

const U1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const U2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const U3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const U4 = 'aaaaaaaa-0000-4000-8000-000000000004';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000ad';

let db: PGlite;

type Profile = {
  id: string;
  handle: string;
  username: string;
  role: string;
  avatar_url: string | null;
  aura_points: string | number;
  weekly_aura_gained: string | number;
  str_stat: number;
  agi_stat: number;
  end_stat: number;
  rec_stat: number;
  streak_days: number;
  streak_shields: number;
  last_active_date: string | null;
  total_workouts: number;
  rank: string;
};

async function profileOf(authId: string): Promise<Profile> {
  await as(db, null);
  const { rows } = await db.query<Profile>(
    `SELECT id, handle, username, role, avatar_url, aura_points, weekly_aura_gained, str_stat, agi_stat, end_stat, rec_stat,
            streak_days, streak_shields, to_char(last_active_date, 'YYYY-MM-DD') AS last_active_date, total_workouts, rank
     FROM profiles WHERE auth_id = $1`,
    [authId],
  );
  return rows[0];
}

type ActionResult = { status: string; aura_earned?: number; stat?: string; stat_amount?: number; streak_outcome?: string; profile?: Record<string, unknown> };

async function rpc(fn: 'complete_quest' | 'complete_workout', userId: string, item: string, aura: number, date: string): Promise<ActionResult> {
  await as(db, 'service_role');
  const { rows } = await db.query<{ r: ActionResult }>(`SELECT public.${fn}($1, $2, $3, $4::date) AS r`, [userId, item, aura, date]);
  await as(db, null);
  return rows[0].r;
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${U1}', 'Jin.Woo+fit@example.com', '{"full_name": "Jinwoo Kai", "avatar_url": "https://lh3.googleusercontent.com/a/x"}'),
      ('${U2}', 'jin.woo+fit@other.org', '{"role": "ADMIN", "avatar_url": "http://insecure.example/x.png"}'),
      ('${U3}', 'x@example.com', '{}'),
      ('${U4}', NULL, '{}'),
      ('${ADMIN}', 'boss@example.com', '{}');
    UPDATE profiles SET role = 'ADMIN' WHERE auth_id = '${ADMIN}';
  `);
  // Demo drops seed (optional admin script) provides workout_drops rows.
  await db.exec(readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'seed', 'demo_workout_drops.sql'), 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('on_auth_user_created trigger', () => {
  it('creates a MEMBER profile with a handle from the sanitised email local-part', async () => {
    const p = await profileOf(U1);
    expect(p.handle).toBe('@jin.woo_fit');
    expect(p.username).toBe('Jinwoo Kai');
    expect(p.role).toBe('MEMBER');
    expect(p.avatar_url).toBe('https://lh3.googleusercontent.com/a/x');
    expect(p.rank).toBe('E-RANK');
  });

  it('makes handles unique and ignores user_metadata for role / non-https avatars', async () => {
    const p = await profileOf(U2);
    expect(p.handle).toMatch(/^@jin\.woo_fit_\d{4}$/);
    expect(p.role).toBe('MEMBER');
    expect(p.avatar_url).toBeNull();
    expect(p.username).toBe('jin.woo+fit');
  });

  it('pads too-short or missing local parts to a valid handle', async () => {
    expect((await profileOf(U3)).handle).toBe('@hunterx');
    const noEmail = await profileOf(U4);
    expect(noEmail.handle).toMatch(/^@hunter(_\d{4})?$/);
    expect(noEmail.username).toBe('Hunter');
  });

  it('trigger and private helpers are not executable by API roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(db, role, U1);
      expect((await attempt(db, `SELECT private.apply_daily_streak(NULL, CURRENT_DATE, 0, 0)`)).error).toMatch(/permission denied/);
      expect((await attempt(db, `SELECT * FROM public.complete_quest($1, 'q_daily_1', 100)`, [U1])).error).toMatch(/permission denied/);
      expect((await attempt(db, `SELECT * FROM public.complete_workout($1, 'drop_phonk_1', 100)`, [U1])).error).toMatch(/permission denied/);
      expect((await attempt(db, `SELECT public.admin_set_role($1, $1, 'ADMIN')`, [U1])).error).toMatch(/permission denied/);
    }
    await as(db, 'anon');
    expect((await attempt(db, `SELECT private.current_profile_role()`)).error).toMatch(/permission denied/);
    await as(db, null);
  });
});

describe('private.apply_daily_streak matches applyDailyStreak()', () => {
  const today = '2026-10-13';
  const prevs = [null, '2026-10-14', today, '2026-10-12', '2026-10-11', '2026-10-10', '2026-01-01'];
  const counters: Array<[number, number]> = [[0, 0], [5, 0], [5, 2], [30, 1]];
  for (const prev of prevs) {
    for (const [streak, shields] of counters) {
      it(`prev=${prev} streak=${streak} shields=${shields}`, async () => {
        await as(db, 'service_role');
        const { rows } = await db.query<{ streak_days: number; streak_shields: number; last_active_date: string; outcome: string }>(
          `SELECT streak_days, streak_shields, to_char(last_active_date, 'YYYY-MM-DD') AS last_active_date, outcome
           FROM private.apply_daily_streak($1::date, $2::date, $3, $4)`,
          [prev, today, streak, shields],
        );
        await as(db, null);
        const ts = applyDailyStreak(prev, today, streak, shields);
        expect({ ...rows[0] }).toEqual({
          streak_days: ts.streakDays,
          streak_shields: ts.streakShields,
          last_active_date: ts.lastActiveDate,
          outcome: ts.outcome,
        });
      });
    }
  }
});

describe('public.complete_quest', () => {
  it('awards aura, clamps the stat, starts the streak and logs the completion', async () => {
    await db.exec(`UPDATE profiles SET str_stat = 99, streak_days = 0, streak_shields = 2 WHERE auth_id = '${U3}'`);
    const before = await profileOf(U3);
    const r = await rpc('complete_quest', before.id, 'q_daily_1', 250, '2026-10-13');
    expect(r).toMatchObject({ status: 'completed', aura_earned: 250, stat: 'str', stat_amount: 3, streak_outcome: 'started' });
    expect(r.profile).toMatchObject({ aura_points: 250, str_stat: 100, streak_days: 1, total_workouts: 1, last_active_date: '2026-10-13' });
    expect(r.profile).not.toHaveProperty('nonexistent');
    const after = await profileOf(U3);
    expect(Number(after.aura_points)).toBe(250);
    expect(Number(after.weekly_aura_gained)).toBe(250);
    expect(after.str_stat).toBe(100);
  });

  it('is idempotent per (user, quest, UTC day): second claim returns already_completed and changes nothing', async () => {
    const p = await profileOf(U3);
    const r = await rpc('complete_quest', p.id, 'q_daily_1', 250, '2026-10-13');
    expect(r).toEqual({ status: 'already_completed' });
    const after = await profileOf(U3);
    expect(Number(after.aura_points)).toBe(250);
    expect(after.total_workouts).toBe(1);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM user_quest_logs WHERE user_id = $1`, [p.id]);
    expect(rows[0].n).toBe(1);
  });

  it('a different quest the same day does not increment the streak twice', async () => {
    const p = await profileOf(U3);
    const r = await rpc('complete_quest', p.id, 'q_daily_2', 400, '2026-10-13');
    expect(r).toMatchObject({ status: 'completed', streak_outcome: 'same_day' });
    expect((await profileOf(U3)).streak_days).toBe(1);
  });

  it('next day increments; one missed day uses a shield; a long gap resets', async () => {
    const p = await profileOf(U3);
    expect((await rpc('complete_quest', p.id, 'q_daily_1', 100, '2026-10-14')).streak_outcome).toBe('incremented');
    expect((await profileOf(U3)).streak_days).toBe(2);
    expect((await rpc('complete_quest', p.id, 'q_daily_1', 100, '2026-10-16')).streak_outcome).toBe('shield_used');
    let now = await profileOf(U3);
    expect([now.streak_days, now.streak_shields]).toEqual([3, 1]);
    expect((await rpc('complete_quest', p.id, 'q_daily_1', 100, '2026-10-20')).streak_outcome).toBe('reset');
    now = await profileOf(U3);
    expect([now.streak_days, now.streak_shields, now.last_active_date]).toEqual([1, 1, '2026-10-20']);
  });

  it('returns not_found / profile_not_found', async () => {
    const p = await profileOf(U3);
    expect(await rpc('complete_quest', p.id, 'q_missing', 10, '2026-10-13')).toEqual({ status: 'not_found' });
    expect(await rpc('complete_quest', '00000000-0000-4000-8000-000000000000', 'q_daily_1', 10, '2026-10-13')).toEqual({
      status: 'profile_not_found',
    });
  });

  it('enforces the aura cap even if the server passes a larger value', async () => {
    const p = await profileOf(U1);
    await as(db, 'service_role');
    for (const bad of [MAX_AURA_PER_SYNC + 1, -1]) {
      const r = await attempt(db, `SELECT public.complete_quest($1, 'q_snack_1', $2, '2026-10-13')`, [p.id, bad]);
      expect(r.error).toMatch(/outside 0\.\.5000/);
    }
    await as(db, null);
    expect(Number((await profileOf(U1)).aura_points)).toBe(0);
  });

  it('updates rank via the existing trigger', async () => {
    const p = await profileOf(U1);
    await db.exec(`UPDATE profiles SET aura_points = 900 WHERE id = '${p.id}'`);
    await rpc('complete_quest', p.id, 'q_daily_1', 250, '2026-10-13');
    expect((await profileOf(U1)).rank).toBe('D-RANK');
  });
});

describe('public.complete_workout', () => {
  it('awards aura + stats, bumps completions_count, and is idempotent per day', async () => {
    const p = await profileOf(U2);
    const drop = INITIAL_WORKOUT_DROPS[0];
    const before = await db.query<{ c: number }>(`SELECT completions_count AS c FROM workout_drops WHERE id = $1`, [drop.id]);
    const r = await rpc('complete_workout', p.id, drop.id, 675, '2026-10-13');
    expect(r).toMatchObject({ status: 'completed', aura_earned: 675, streak_outcome: 'started' });
    expect(r.profile).toMatchObject({ aura_points: 675, str_stat: 54, agi_stat: 54, end_stat: 53, total_workouts: 1 });
    const after = await db.query<{ c: number }>(`SELECT completions_count AS c FROM workout_drops WHERE id = $1`, [drop.id]);
    expect(after.rows[0].c).toBe(before.rows[0].c + 1);

    expect(await rpc('complete_workout', p.id, drop.id, 675, '2026-10-13')).toEqual({ status: 'already_completed' });
    expect(Number((await profileOf(U2)).aura_points)).toBe(675);
    expect(await rpc('complete_workout', p.id, 'drop_missing', 1, '2026-10-13')).toEqual({ status: 'not_found' });
  });

  it('workout logs are readable by their owner only', async () => {
    await as(db, 'authenticated', U2);
    expect((await db.query(`SELECT id FROM user_workout_logs`)).rows).toHaveLength(1);
    await as(db, 'authenticated', U1);
    expect((await db.query(`SELECT id FROM user_workout_logs`)).rows).toHaveLength(0);
    await as(db, 'authenticated', ADMIN);
    expect((await db.query(`SELECT id FROM user_workout_logs`)).rows).toHaveLength(1);
    await as(db, null);
  });
});

describe('public.admin_set_role', () => {
  it('only an ADMIN actor can change roles; clients can never write role directly', async () => {
    const admin = await profileOf(ADMIN);
    const member = await profileOf(U1);
    await as(db, 'service_role');
    const denied = await db.query<{ r: { status: string } }>(`SELECT public.admin_set_role($1, $2, 'ADMIN') AS r`, [member.id, member.id]);
    expect(denied.rows[0].r.status).toBe('forbidden');
    const ok = await db.query<{ r: { status: string } }>(`SELECT public.admin_set_role($1, $2, 'CREATOR') AS r`, [admin.id, member.id]);
    expect(ok.rows[0].r.status).toBe('updated');
    await as(db, 'authenticated', ADMIN);
    expect((await attempt(db, `UPDATE profiles SET role = 'ADMIN' WHERE id = $1`, [member.id])).error).toMatch(/permission denied/);
    await as(db, null);
    expect((await profileOf(U1)).role).toBe('CREATOR');
  });
});

describe('supabase/seed/demo_workout_drops.sql', () => {
  it('seeds INITIAL_WORKOUT_DROPS with system creators and is idempotent', async () => {
    await db.exec(readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'seed', 'demo_workout_drops.sql'), 'utf8'));
    const { rows } = await db.query<{ id: string; xp_points: number; aura_multiplier: string; n: number; auth_id: string | null }>(
      `SELECT d.id, d.xp_points, d.aura_multiplier, jsonb_array_length(d.exercises) AS n, p.auth_id
       FROM workout_drops d JOIN profiles p ON p.id = d.creator_id ORDER BY d.id`,
    );
    const expected = [...INITIAL_WORKOUT_DROPS].sort((a, b) => a.id.localeCompare(b.id));
    expect(rows.map((r) => r.id)).toEqual(expected.map((d) => d.id));
    rows.forEach((r, i) => {
      expect(r.xp_points).toBe(expected[i].xpPoints);
      expect(Number(r.aura_multiplier)).toBe(expected[i].auraMultiplier);
      expect(r.n).toBe(expected[i].exercises.length);
      expect(r.auth_id).toBeNull();
    });
  });
});
