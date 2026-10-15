/**
 * PGlite tests for supabase/migrations/20261014120000_squads.sql: the server-only squad functions
 * (create / join / full / leave / leader handover / delete-on-empty / regenerate / remove / update),
 * the weekly aura window, the leaderboard and activity feed, the account-deletion trigger, and
 * privileges / RLS (clients cannot write squads or read invite codes / membership).
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ICON_KEYS, INVITE_CODE_ALPHABET, isInviteCode, SQUAD_MAX_MEMBERS } from '../src/index';
import { as as asRole, attempt as tryQuery, createDb, type DbRole } from './pglite-helpers';

let db: PGlite;
const as = (role: DbRole, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

type Result = Record<string, unknown> & { status: string };

let seq = 0;
/** Creates an auth user (profile via the signup trigger) and returns { authId, id }. */
async function user(name: string): Promise<{ authId: string; id: string }> {
  await as(null);
  seq += 1;
  const authId = `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`;
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [authId, `${name}${seq}@example.com`]);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM profiles WHERE auth_id = $1`, [authId]);
  return { authId, id: rows[0].id };
}

async function call(sql: string, params: unknown[] = []): Promise<Result> {
  await as('service_role');
  const { rows } = await db.query<{ r: Result }>(`SELECT ${sql} AS r`, params);
  await as(null);
  return rows[0].r;
}

const create = (profileId: string, name: string, tag: string, icon = 'swords') =>
  call(`public.create_squad($1, $2, $3, $4)`, [profileId, name, tag, icon]);
const join = (profileId: string, code: string) => call(`public.join_squad($1, $2)`, [profileId, code]);
const leave = (profileId: string) => call(`public.leave_squad($1)`, [profileId]);
const remove = (actor: string, target: string) => call(`public.remove_squad_member($1, $2)`, [actor, target]);
const regenerate = (actor: string) => call(`public.regenerate_squad_invite_code($1)`, [actor]);
const update = (actor: string, patch: Record<string, unknown>) => call(`public.update_squad($1, $2::jsonb)`, [actor, JSON.stringify(patch)]);
const mine = (profileId: string, now?: string) =>
  now ? call(`public.get_member_squad($1, $2::timestamptz)`, [profileId, now]) : call(`public.get_member_squad($1)`, [profileId]);

async function squadRow(id: string) {
  await as(null);
  const { rows } = await db.query<{ id: string; name: string; tag: string; invite_code: string; leader_id: string | null; weekly_goal: number | null; avatar: string }>(
    `SELECT id, name, tag, invite_code, leader_id, weekly_goal, avatar FROM squads WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function squadOf(profileId: string): Promise<string | null> {
  await as(null);
  const { rows } = await db.query<{ squad_id: string | null }>(`SELECT squad_id FROM profiles WHERE id = $1`, [profileId]);
  return rows[0]?.squad_id ?? null;
}

/** Leader + squad with `extra` additional members. */
async function squadWith(extra: number, name = 'Night Shift', tag = 'NIGHT') {
  const leader = await user('leader');
  const r = await create(leader.id, name, tag);
  expect(r.status).toBe('created');
  const squadId = r.squad_id as string;
  const { invite_code: code } = await squadRow(squadId);
  const members: string[] = [];
  for (let i = 0; i < extra; i++) {
    const m = await user(`m${i}`);
    expect((await join(m.id, code)).status).toBe('joined');
    members.push(m.id);
  }
  return { leader: leader.id, squadId, code, members };
}

async function logQuest(userId: string, completedAt: string, aura: number, questId = 'q_daily_1') {
  await as(null);
  await db.query(
    `INSERT INTO user_quest_logs (user_id, quest_id, aura_earned, completed_at, date_key) VALUES ($1, $2, $3, $4, ($4::timestamptz AT TIME ZONE 'UTC')::date)`,
    [userId, questId, aura, completedAt],
  );
}

async function logWorkout(userId: string, completedAt: string, aura: number) {
  await as(null);
  await db.query(
    `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate)
     SELECT 'drop_sq', 'Squad Burner', $1, 'v', 5, 50 WHERE NOT EXISTS (SELECT 1 FROM workout_drops WHERE id = 'drop_sq')`,
    [userId],
  );
  await db.query(
    `INSERT INTO user_workout_logs (user_id, drop_id, aura_earned, completed_at, date_key) VALUES ($1, 'drop_sq', $2, $3, ($3::timestamptz AT TIME ZONE 'UTC')::date)`,
    [userId, aura, completedAt],
  );
}

beforeAll(async () => {
  db = await createDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await as(null);
  await db.exec(`DELETE FROM auth.users; DELETE FROM squads; DELETE FROM workout_drops;`);
});

describe('schema', () => {
  it('drops the seed counters and keeps the icon list in sync with ICON_KEYS', async () => {
    await as(null);
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'squads' ORDER BY column_name`,
    );
    const cols = rows.map((r) => r.column_name);
    for (const gone of ['member_count', 'streak_days', 'weekly_goal_progress', 'status']) expect(cols).not.toContain(gone);
    for (const kept of ['id', 'name', 'tag', 'avatar', 'invite_code', 'weekly_goal', 'leader_id', 'max_members']) expect(cols).toContain(kept);
    expect((await db.query(`SELECT 1 FROM pg_type WHERE typname = 'squad_status_enum'`)).rows).toHaveLength(0);

    const { rows: def } = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'squads_icon_key'`,
    );
    const inSql = [...def[0].def.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...ICON_KEYS].sort());
  });

  it('enforces name / tag / icon / invite code / weekly goal rules', async () => {
    const a = await user('a');
    const bad = async (sql: string, re: RegExp) => expect((await attempt(sql, [a.id])).error).toMatch(re);
    await as(null);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES ('ab', 'OKAY', $1)`, /squads_name_check/);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES (' padded ', 'OKAY', $1)`, /squads_name_check/);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES ('${'x'.repeat(41)}', 'OKAY', $1)`, /squads_name_check/);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES ('Fine Name', 'okay', $1)`, /squads_tag_format/);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES ('Fine Name', 'TOOLONG', $1)`, /squads_tag_format/);
    await bad(`INSERT INTO squads (name, tag, leader_id) VALUES ('Fine Name', '#SOLO', $1)`, /squads_tag_format/);
    await bad(`INSERT INTO squads (name, tag, avatar, leader_id) VALUES ('Fine Name', 'OKAY', 'rocket', $1)`, /squads_icon_key/);
    await bad(`INSERT INTO squads (name, tag, invite_code, leader_id) VALUES ('Fine Name', 'OKAY', 'ABCD0OI1', $1)`, /squads_invite_code_format/);
    await bad(`INSERT INTO squads (name, tag, weekly_goal, leader_id) VALUES ('Fine Name', 'OKAY', 999, $1)`, /squads_weekly_goal_range/);
    await bad(`INSERT INTO squads (name, tag, weekly_goal, leader_id) VALUES ('Fine Name', 'OKAY', 50001, $1)`, /squads_weekly_goal_range/);
    // squad_id and squad_joined_at always move together.
    expect((await attempt(`UPDATE profiles SET squad_joined_at = now() WHERE id = $1`, [a.id])).error).toMatch(/profiles_squad_joined_at_check/);
  });

  it('generates 8-char invite codes from the unambiguous alphabet', async () => {
    await as('service_role');
    const { rows } = await db.query<{ c: string }>(`SELECT private.new_squad_invite_code() AS c FROM generate_series(1, 300)`);
    await as(null);
    const codes = rows.map((r) => r.c);
    for (const c of codes) expect(isInviteCode(c), c).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    const used = new Set(codes.join(''));
    for (const ch of '0O1I') expect(used.has(ch)).toBe(false);
    // Every alphabet symbol shows up over 2,400 draws (sanity check that the full alphabet is used).
    expect([...INVITE_CODE_ALPHABET].every((ch) => used.has(ch))).toBe(true);
  });
});

describe('create_squad', () => {
  it('creates a squad led by the creator, who becomes its first member', async () => {
    const a = await user('a');
    const r = await create(a.id, 'Night Shift', 'NIGHT', 'flame');
    expect(r).toMatchObject({ status: 'created', squad_id: expect.any(String) });
    const row = await squadRow(r.squad_id as string);
    expect(row).toMatchObject({ name: 'Night Shift', tag: 'NIGHT', leader_id: a.id, weekly_goal: null, avatar: 'flame' });
    expect(isInviteCode(row.invite_code)).toBe(true);
    expect(await squadOf(a.id)).toBe(r.squad_id);
  });

  it('refuses a second squad, taken names (case-insensitive) and taken tags', async () => {
    const a = await user('a');
    const b = await user('b');
    expect((await create(a.id, 'Night Shift', 'NIGHT')).status).toBe('created');
    expect(await create(a.id, 'Other Squad', 'OTHER')).toMatchObject({ status: 'already_in_squad' });
    expect((await create(b.id, 'NIGHT shift', 'OTHER')).status).toBe('name_taken');
    expect((await create(b.id, 'Different', 'NIGHT')).status).toBe('tag_taken');
    expect(await squadOf(b.id)).toBeNull();
    expect((await create(b.id, 'Different', 'DIFF')).status).toBe('created');
  });

  it('profile_not_found for an unknown profile', async () => {
    expect((await create('00000000-0000-4000-8000-00000000dead', 'Ghosts', 'BOO')).status).toBe('profile_not_found');
  });
});

describe('join_squad', () => {
  it('joins by code (case/space-insensitive) and refuses invalid codes', async () => {
    const { squadId, code } = await squadWith(0);
    const b = await user('b');
    expect((await join(b.id, 'ZZZZZZZZ')).status).toBe('invalid_code');
    expect((await join(b.id, '')).status).toBe('invalid_code');
    expect(await join(b.id, ` ${code.toLowerCase()} `)).toMatchObject({ status: 'joined', squad_id: squadId });
    expect(await squadOf(b.id)).toBe(squadId);
    expect(await join(b.id, code)).toMatchObject({ status: 'already_in_squad', squad_id: squadId });
  });

  it('a member of another squad cannot join', async () => {
    const one = await squadWith(0, 'Squad One', 'ONE');
    const two = await squadWith(0, 'Squad Two', 'TWO');
    expect(await join(two.leader, one.code)).toMatchObject({ status: 'already_in_squad', squad_id: two.squadId });
  });

  it('caps the squad at max members (5), also when many joins race', async () => {
    const { squadId, code } = await squadWith(3); // 4 members
    const hopefuls = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => user(`h${i}`)));
    const results = await Promise.all(hopefuls.map((h) => join(h.id, code)));
    expect(results.filter((r) => r.status === 'joined')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'full')).toHaveLength(5);
    await as(null);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM profiles WHERE squad_id = $1`, [squadId]);
    expect(rows[0].n).toBe(SQUAD_MAX_MEMBERS);
  });

  it('locks the squad row before counting members (lock order squad -> profile)', async () => {
    await as(null);
    const { rows } = await db.query<{ src: string }>(`SELECT prosrc AS src FROM pg_proc WHERE proname = 'join_squad'`);
    const src = rows[0].src;
    const squadLock = src.indexOf('FROM public.squads WHERE invite_code');
    const profileLock = src.indexOf('FROM public.profiles WHERE id = p_profile_id FOR UPDATE');
    const count = src.indexOf('SELECT count(*)');
    expect(squadLock).toBeGreaterThan(-1);
    expect(src.slice(squadLock, profileLock)).toContain('FOR UPDATE');
    expect(profileLock).toBeGreaterThan(squadLock);
    expect(count).toBeGreaterThan(profileLock);
  });
});

describe('leave_squad', () => {
  it('a member leaves; leader unchanged', async () => {
    const { leader, squadId, members } = await squadWith(2);
    expect(await leave(members[0])).toMatchObject({ status: 'left', squad_deleted: false, new_leader_id: null });
    expect(await squadOf(members[0])).toBeNull();
    expect((await squadRow(squadId)).leader_id).toBe(leader);
    expect((await leave(members[0])).status).toBe('not_in_squad');
  });

  it('leader leaving hands leadership to the longest-standing member', async () => {
    const { leader, squadId, members } = await squadWith(3);
    // Make members[2] the longest-standing non-leader member.
    await as(null);
    await db.query(`UPDATE profiles SET squad_joined_at = now() - interval '3 days' WHERE id = $1`, [members[2]]);
    expect(await leave(leader)).toMatchObject({ status: 'left', squad_deleted: false, new_leader_id: members[2] });
    expect((await squadRow(squadId)).leader_id).toBe(members[2]);
  });

  it('the last member leaving deletes the squad (and frees its name/tag)', async () => {
    const { leader, squadId, members } = await squadWith(1);
    await leave(leader);
    expect((await squadRow(squadId)).leader_id).toBe(members[0]);
    expect(await leave(members[0])).toMatchObject({ status: 'left', squad_deleted: true });
    expect(await squadRow(squadId)).toBeUndefined();
    const c = await user('c');
    expect((await create(c.id, 'Night Shift', 'NIGHT')).status).toBe('created');
  });

  it('records join time and clears it on leave', async () => {
    const { members } = await squadWith(1);
    await as(null);
    const before = await db.query<{ t: string | null }>(`SELECT squad_joined_at AS t FROM profiles WHERE id = $1`, [members[0]]);
    expect(before.rows[0].t).not.toBeNull();
    await leave(members[0]);
    const after = await db.query<{ t: string | null }>(`SELECT squad_joined_at AS t FROM profiles WHERE id = $1`, [members[0]]);
    expect(after.rows[0].t).toBeNull();
  });
});

describe('leader actions', () => {
  it('regenerate: new code works, old code is invalid, members cannot regenerate', async () => {
    const { leader, members, code } = await squadWith(1);
    expect((await regenerate(members[0])).status).toBe('not_leader');
    const r = await regenerate(leader);
    expect(r.status).toBe('regenerated');
    const fresh = r.invite_code as string;
    expect(isInviteCode(fresh)).toBe(true);
    expect(fresh).not.toBe(code);
    const b = await user('b');
    expect((await join(b.id, code)).status).toBe('invalid_code');
    expect((await join(b.id, fresh)).status).toBe('joined');
    const loner = await user('loner');
    expect((await regenerate(loner.id)).status).toBe('not_in_squad');
  });

  it('remove member: leader only, same squad only, never self', async () => {
    const { leader, squadId, members } = await squadWith(2);
    const other = await squadWith(0, 'Other Squad', 'OTHER');
    expect((await remove(members[0], members[1])).status).toBe('not_leader');
    expect((await remove(leader, leader)).status).toBe('cannot_remove_self');
    expect((await remove(leader, other.leader)).status).toBe('member_not_found');
    expect(await remove(leader, members[0])).toMatchObject({ status: 'removed', squad_id: squadId });
    expect(await squadOf(members[0])).toBeNull();
    expect((await remove(leader, members[0])).status).toBe('member_not_found');
  });

  it('update: name / icon / weekly goal (null = automatic); leader only; name uniqueness', async () => {
    const { leader, squadId, members } = await squadWith(1);
    await squadWith(0, 'Taken Name', 'TAKEN');
    expect((await update(members[0], { name: 'Hijack' })).status).toBe('not_leader');
    expect((await update(leader, { name: 'taken name' })).status).toBe('name_taken');
    expect((await update(leader, { name: 'Dawn Patrol', icon: 'crown', weekly_goal: 12000 })).status).toBe('updated');
    expect(await squadRow(squadId)).toMatchObject({ name: 'Dawn Patrol', avatar: 'crown', weekly_goal: 12000, tag: 'NIGHT' });
    expect((await update(leader, { weekly_goal: null })).status).toBe('updated');
    expect((await squadRow(squadId)).weekly_goal).toBeNull();
    expect((await update(leader, {})).status).toBe('updated');
    expect((await squadRow(squadId)).name).toBe('Dawn Patrol');
    // Out-of-range values are rejected by the CHECK constraint (the API validates first).
    await as('service_role');
    expect((await attempt(`SELECT public.update_squad($1, '{"weekly_goal": 60000}'::jsonb)`, [leader])).error).toMatch(/squads_weekly_goal_range/);
    await as(null);
  });
});

describe('weekly aura (current ISO week, Monday 00:00 UTC) from the ledgers', () => {
  // Wednesday 14 Oct 2026; the week runs Mon 12 Oct 00:00Z .. Mon 19 Oct 00:00Z.
  const NOW = '2026-10-14T12:00:00Z';

  it('sums quest + workout aura per member inside the window only', async () => {
    const { leader, members, squadId } = await squadWith(1);
    await logQuest(leader, '2026-10-12T00:00:00Z', 100); // first instant of the week: counts
    await logQuest(leader, '2026-10-11T23:59:59Z', 900, 'q_daily_2'); // Sunday before: excluded
    await logWorkout(leader, '2026-10-13T08:00:00Z', 250);
    await logQuest(members[0], '2026-10-18T23:59:59Z', 40); // last second of the week: counts
    await logQuest(members[0], '2026-10-19T00:00:00Z', 777, 'q_daily_2'); // next Monday: excluded
    // The stale counter is ignored.
    await as(null);
    await db.query(`UPDATE profiles SET weekly_aura_gained = 99999 WHERE id = $1`, [leader]);

    const r = await mine(leader, NOW);
    expect(r).toMatchObject({ status: 'ok', rank: 1 });
    expect(new Date(r.week_start as string).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(new Date(r.week_end as string).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    const members_ = r.members as { profile_id: string; weekly_aura: number }[];
    expect(members_.map((m) => [m.profile_id, Number(m.weekly_aura)])).toEqual([
      [leader, 350],
      [members[0], 40],
    ]);
    expect((r.squad as { id: string }).id).toBe(squadId);
  });

  it('Monday 00:00 UTC starts a new week', async () => {
    const { leader } = await squadWith(0);
    await logQuest(leader, '2026-10-18T22:00:00Z', 100);
    const sunday = await mine(leader, '2026-10-18T23:59:59Z');
    const monday = await mine(leader, '2026-10-19T00:00:00Z');
    expect(Number((sunday.members as { weekly_aura: number }[])[0].weekly_aura)).toBe(100);
    expect(Number((monday.members as { weekly_aura: number }[])[0].weekly_aura)).toBe(0);
  });

  it('invite code only for the leader; not_in_squad otherwise', async () => {
    const { leader, members, code } = await squadWith(1);
    expect(((await mine(leader)).squad as { invite_code: string | null }).invite_code).toBe(code);
    expect(((await mine(members[0])).squad as { invite_code: string | null }).invite_code).toBeNull();
    const loner = await user('loner');
    expect((await mine(loner.id)).status).toBe('not_in_squad');
  });

  it('leaderboard: ranked by weekly aura, no member details, empty squads never listed', async () => {
    const a = await squadWith(1, 'Alpha Squad', 'ALPHA');
    const b = await squadWith(0, 'Bravo Squad', 'BRAVO');
    const c = await squadWith(0, 'Charlie Squad', 'CHARL');
    await logQuest(a.members[0], '2026-10-13T10:00:00Z', 300);
    await logQuest(b.leader, '2026-10-13T10:00:00Z', 500);
    await logQuest(c.leader, '2026-10-05T10:00:00Z', 5000); // last week
    await as('service_role');
    const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM public.squad_leaderboard(10, $1::timestamptz)`, [NOW]);
    await as(null);
    expect(rows.map((r) => [Number(r.rank), r.tag, Number(r.member_count), Number(r.weekly_aura)])).toEqual([
      [1, 'BRAVO', 1, 500],
      [2, 'ALPHA', 2, 300],
      [3, 'CHARL', 1, 0],
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(['icon', 'max_members', 'member_count', 'name', 'rank', 'squad_id', 'tag', 'week_start', 'weekly_aura']);
    expect(Number((await mine(a.leader, NOW)).rank)).toBe(2);
    await as('service_role');
    const limited = await db.query(`SELECT * FROM public.squad_leaderboard(1, $1::timestamptz)`, [NOW]);
    await as(null);
    expect(limited.rows).toHaveLength(1);
  });

  it('activity: members only, this week only, newest first, with titles', async () => {
    const { leader, members } = await squadWith(1);
    const outsider = await user('outsider');
    await logQuest(leader, '2026-10-12T09:00:00Z', 250);
    await logWorkout(members[0], '2026-10-14T07:00:00Z', 180);
    await logQuest(members[0], '2026-10-05T07:00:00Z', 999, 'q_daily_2'); // last week
    await logQuest(outsider.id, '2026-10-13T07:00:00Z', 50); // not a member
    const r = await call(`public.squad_activity($1, 30, $2::timestamptz)`, [leader, NOW]);
    expect(r.status).toBe('ok');
    const items = r.items as { kind: string; title: string; aura: number; profile_id: string; handle: string }[];
    expect(items.map((i) => [i.kind, i.title, i.aura, i.profile_id])).toEqual([
      ['WORKOUT', 'Squad Burner', 180, members[0]],
      ['QUEST', 'Daily Protocol: Pushup Ignition', 250, leader],
    ]);
    expect(items[0].handle).toMatch(/^@/);
    expect((await call(`public.squad_activity($1, 30, $2::timestamptz)`, [outsider.id, NOW])).status).toBe('not_in_squad');
  });
});

describe('account deletion', () => {
  it('deleting the leader hands over leadership; deleting the last member deletes the squad', async () => {
    const { leader, squadId, members } = await squadWith(1);
    const leaderAuth = await db.query<{ auth_id: string }>(`SELECT auth_id FROM profiles WHERE id = $1`, [leader]);
    await as(null);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [leaderAuth.rows[0].auth_id]);
    expect((await squadRow(squadId)).leader_id).toBe(members[0]);
    const memberAuth = await db.query<{ auth_id: string }>(`SELECT auth_id FROM profiles WHERE id = $1`, [members[0]]);
    await db.query(`DELETE FROM auth.users WHERE id = $1`, [memberAuth.rows[0].auth_id]);
    expect(await squadRow(squadId)).toBeUndefined();
  });
});

describe('privileges and RLS', () => {
  const FUNCTIONS = [
    `public.create_squad('00000000-0000-4000-8000-000000000000', 'Hackers', 'HACK', 'zap')`,
    `public.join_squad('00000000-0000-4000-8000-000000000000', 'AAAAAAAA')`,
    `public.leave_squad('00000000-0000-4000-8000-000000000000')`,
    `public.remove_squad_member('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000001')`,
    `public.regenerate_squad_invite_code('00000000-0000-4000-8000-000000000000')`,
    `public.update_squad('00000000-0000-4000-8000-000000000000', '{}'::jsonb)`,
    `public.get_member_squad('00000000-0000-4000-8000-000000000000')`,
    `public.squad_activity('00000000-0000-4000-8000-000000000000')`,
    `private.new_squad_invite_code()`,
  ];

  it('RLS is enabled on squads', async () => {
    await as(null);
    const { rows } = await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.squads'::regclass`);
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it.each(['anon', 'authenticated'] as const)('%s cannot call any squad function or write squads', async (role) => {
    const { leader, squadId } = await squadWith(0);
    const auth = await db.query<{ auth_id: string }>(`SELECT auth_id FROM profiles WHERE id = $1`, [leader]);
    await as(role, auth.rows[0].auth_id);
    for (const f of FUNCTIONS) expect((await attempt(`SELECT ${f}`)).error, f).toMatch(/permission denied/);
    expect((await attempt(`SELECT * FROM public.squad_leaderboard()`)).error).toMatch(/permission denied/);
    expect((await attempt(`INSERT INTO squads (name, tag) VALUES ('Mine Now', 'MINE')`)).error).toMatch(/permission denied/);
    expect((await attempt(`UPDATE squads SET name = 'Pwned Squad' WHERE id = $1`, [squadId])).error).toMatch(/permission denied/);
    expect((await attempt(`DELETE FROM squads WHERE id = $1`, [squadId])).error).toMatch(/permission denied/);
    expect((await attempt(`TRUNCATE squads CASCADE`)).error).toMatch(/permission denied/);
    // Membership cannot be self-assigned or read through the Data API.
    expect((await attempt(`UPDATE profiles SET squad_id = $1 WHERE id = $2`, [squadId, leader])).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT squad_id FROM profiles`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT squad_joined_at FROM profiles`)).error).toMatch(/permission denied/);
    // Public squad columns are readable; secrets are not.
    expect((await attempt(`SELECT id, name, tag, avatar, max_members, weekly_goal, created_at FROM squads`)).rows).toHaveLength(1);
    expect((await attempt(`SELECT invite_code FROM squads`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT leader_id FROM squads`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT * FROM squads`)).error).toMatch(/permission denied/);
    // Profiles stay publicly readable for everything else.
    expect((await attempt(`SELECT handle, aura_points FROM profiles`)).error).toBeUndefined();
    await as(null);
  });

  it('service_role can run every squad function', async () => {
    await as('service_role');
    for (const f of FUNCTIONS) expect((await attempt(`SELECT ${f}`)).error, f).toBeUndefined();
    expect((await attempt(`SELECT * FROM public.squad_leaderboard()`)).error).toBeUndefined();
    await as(null);
  });

  it('squad functions are SECURITY INVOKER (except the Auth-fired delete trigger) with a pinned search_path', async () => {
    await as(null);
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT proname, prosecdef, proconfig FROM pg_proc
       WHERE proname IN ('create_squad', 'join_squad', 'leave_squad', 'remove_squad_member', 'regenerate_squad_invite_code',
                         'update_squad', 'get_member_squad', 'squad_leaderboard', 'squad_activity', 'new_squad_invite_code',
                         'squad_week_start', 'squad_member_week_aura', 'squad_week_totals', 'sync_squad_joined_at', 'squad_member_deleted')`,
    );
    expect(rows).toHaveLength(15);
    for (const r of rows) {
      // Fired by the auth.users -> profiles cascade, which Supabase Auth runs as supabase_auth_admin
      // (no access to public.squads): like private.handle_new_user it must run as its owner.
      expect(r.prosecdef, r.proname).toBe(r.proname === 'squad_member_deleted');
      expect(r.proconfig, r.proname).toContain('search_path=""');
    }
  });
});
