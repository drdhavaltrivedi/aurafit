/**
 * PGlite tests for supabase/migrations/20261014110000_push.sql: tables + constraints,
 * privileges/RLS (no client access), the idempotency ledger, and recipient selection at
 * fixed instants across time zones.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as as asRole, attempt as tryQuery, createDb, type DbRole } from './pglite-helpers';

let db: PGlite;
const as = (role: DbRole, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

let seq = 0;
const tokenFor = (n: number) => `ExponentPushToken[tok_${n}]`;

interface UserOpts {
  tz?: string | null; // null = no settings row
  streakSaver?: boolean;
  dailyHour?: number | null;
  streak?: number;
  shields?: number;
  lastActive?: string | null;
  tokens?: number; // number of push tokens
}

/** Creates an auth user (+ profile via trigger) and returns the profile id. */
async function user(name: string, o: UserOpts = {}): Promise<string> {
  await as(null);
  seq += 1;
  const authId = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [authId, `${name}${seq}@example.com`]);
  const { rows } = await db.query<{ id: string }>(
    `UPDATE profiles SET streak_days = $2, streak_shields = $3, last_active_date = $4 WHERE auth_id = $1 RETURNING id`,
    [authId, o.streak ?? 5, o.shields ?? 0, o.lastActive === undefined ? '2026-10-13' : o.lastActive],
  );
  const id = rows[0].id;
  if (o.tz !== null) {
    await db.query(
      `INSERT INTO notification_settings (user_id, timezone, streak_saver, daily_reminder_hour) VALUES ($1, $2, $3, $4)`,
      [id, o.tz ?? 'Europe/London', o.streakSaver ?? true, o.dailyHour ?? null],
    );
  }
  for (let i = 0; i < (o.tokens ?? 1); i++) {
    seq += 1;
    await db.query(`INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, 'ios')`, [id, tokenFor(seq)]);
  }
  return id;
}

async function logQuest(userId: string, completedAt: string, dateKey: string) {
  await as(null);
  await db.query(
    `INSERT INTO user_quest_logs (user_id, quest_id, aura_earned, completed_at, date_key) VALUES ($1, 'q_daily_1', 10, $2, $3)`,
    [userId, completedAt, dateKey],
  );
}

async function due(kind: string, now: string): Promise<string[]> {
  await as(null);
  const { rows } = await db.query<{ user_id: string }>(`SELECT user_id FROM private.due_notification_recipients($1, $2)`, [kind, now]);
  return rows.map((r) => r.user_id).sort();
}

async function claim(kind: string, now: string) {
  await as('service_role');
  const { rows } = await db.query<{ user_id: string; local_date: string | Date; streak_days: number; tokens: string[] }>(
    `SELECT * FROM public.claim_due_notifications($1, $2)`,
    [kind, now],
  );
  await as(null);
  return rows;
}

const sorted = (ids: string[]) => [...ids].sort();

beforeAll(async () => {
  db = await createDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await as(null);
  await db.exec(`DELETE FROM auth.users; DELETE FROM notification_log; DELETE FROM push_tickets;`);
});

describe('tables and constraints', () => {
  it('settings: defaults, hour range, cascade with the profile', async () => {
    const id = await user('c', { tz: null, tokens: 0 });
    await db.query(`INSERT INTO notification_settings (user_id) VALUES ($1)`, [id]);
    const { rows } = await db.query(`SELECT timezone, streak_saver, daily_reminder_hour FROM notification_settings WHERE user_id = $1`, [id]);
    expect(rows[0]).toEqual({ timezone: 'UTC', streak_saver: true, daily_reminder_hour: null });
    expect((await attempt(`UPDATE notification_settings SET daily_reminder_hour = 24 WHERE user_id = $1`, [id])).error).toMatch(/check constraint/);
    expect((await attempt(`UPDATE notification_settings SET daily_reminder_hour = -1 WHERE user_id = $1`, [id])).error).toMatch(/check constraint/);
    expect((await attempt(`UPDATE notification_settings SET daily_reminder_hour = 23 WHERE user_id = $1`, [id])).error).toBeUndefined();
    await db.query(`DELETE FROM profiles WHERE id = $1`, [id]);
    expect((await db.query(`SELECT 1 FROM notification_settings WHERE user_id = $1`, [id])).rows).toHaveLength(0);
  });

  it('push_tokens: Expo token format, platform, global uniqueness, cascade', async () => {
    const a = await user('a', { tokens: 0 });
    const b = await user('b', { tokens: 0 });
    const ins = (uid: string, token: string, platform = 'android') =>
      attempt(`INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)`, [uid, token, platform]);
    expect((await ins(a, 'ExponentPushToken[abc-DEF_123]')).error).toBeUndefined();
    expect((await ins(a, 'ExpoPushToken[newer_format]')).error).toBeUndefined();
    expect((await ins(b, 'ExponentPushToken[abc-DEF_123]')).error).toMatch(/duplicate key/);
    expect((await ins(a, 'not-a-token')).error).toMatch(/check constraint/);
    expect((await ins(a, 'ExponentPushToken[]')).error).toMatch(/check constraint/);
    expect((await ins(a, 'ExponentPushToken[x]', 'web')).error).toMatch(/check constraint/);
    await db.query(`DELETE FROM auth.users`);
    expect((await db.query(`SELECT 1 FROM push_tokens`)).rows).toHaveLength(0);
  });

  it('notification_log: one row per (user, kind, local_date); kind is constrained', async () => {
    const a = await user('a');
    const ins = (kind: string, d: string) => attempt(`INSERT INTO notification_log (user_id, kind, local_date) VALUES ($1, $2, $3)`, [a, kind, d]);
    expect((await ins('STREAK_SAVER', '2026-10-14')).error).toBeUndefined();
    expect((await ins('STREAK_SAVER', '2026-10-14')).error).toMatch(/duplicate key/);
    expect((await ins('DAILY_REMINDER', '2026-10-14')).error).toBeUndefined();
    expect((await ins('STREAK_SAVER', '2026-10-15')).error).toBeUndefined();
    expect((await ins('MARKETING', '2026-10-14')).error).toMatch(/check constraint/);
  });
});

describe('privileges and RLS', () => {
  const TABLES = ['notification_settings', 'push_tokens', 'notification_log', 'push_tickets'];

  it('RLS is enabled on every table', async () => {
    await as(null);
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
      [TABLES],
    );
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it.each(['anon', 'authenticated'] as const)('%s has no access to any table or function', async (role) => {
    const a = await user('a');
    await as(role, '00000000-0000-4000-8000-000000000001');
    for (const t of TABLES) {
      expect((await attempt(`SELECT * FROM ${t}`)).error, t).toMatch(/permission denied/);
      expect((await attempt(`DELETE FROM ${t}`)).error, t).toMatch(/permission denied/);
    }
    expect((await attempt(`INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, 'ExponentPushToken[x]', 'ios')`, [a])).error).toMatch(/permission denied/);
    expect((await attempt(`UPDATE notification_settings SET streak_saver = false`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT * FROM public.claim_due_notifications('STREAK_SAVER')`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT public.release_notification_claims('STREAK_SAVER', '{}', '{}')`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT * FROM private.due_notification_recipients('STREAK_SAVER')`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT private.dispatch_notifications_cron()`)).error).toMatch(/permission denied/);
    await as(null);
  });

  it('service_role can use the tables and claim functions but not the cron dispatcher', async () => {
    await user('a');
    await as('service_role');
    for (const t of TABLES) expect((await attempt(`SELECT * FROM ${t}`)).error, t).toBeUndefined();
    expect((await attempt(`SELECT * FROM public.claim_due_notifications('STREAK_SAVER', '2026-10-14T19:00:00Z')`)).error).toBeUndefined();
    expect((await attempt(`SELECT * FROM public.claim_due_notifications('SPAM')`)).error).toMatch(/unknown notification kind/);
    expect((await attempt(`SELECT private.dispatch_notifications_cron()`)).error).toMatch(/permission denied/);
    await as(null);
  });

  it('the cron dispatcher is a no-op without Vault / pg_net (local, PGlite)', async () => {
    await as(null);
    expect((await db.query(`SELECT private.dispatch_notifications_cron() AS id`)).rows).toEqual([{ id: null }]);
  });
});

describe('recipient selection: STREAK_SAVER', () => {
  // 19:00 UTC on 14 Oct 2026 = 20:00 in London (BST, UTC+1).
  const LONDON_8PM = '2026-10-14T19:00:00Z';

  it('selects at-risk streaks at 20:00 local and skips everyone else', async () => {
    const due1 = await user('due', { lastActive: '2026-10-13', streak: 7 });
    const shield = await user('shield', { lastActive: '2026-10-12', shields: 1 });
    await user('trainedToday', { lastActive: '2026-10-14' });
    await user('lost', { lastActive: '2026-10-12', shields: 0 }); // gap 2, no shield: already lost
    await user('lostLong', { lastActive: '2026-10-10', shields: 2 });
    await user('noStreak', { streak: 0, lastActive: null });
    await user('optedOut', { streakSaver: false });
    await user('noToken', { tokens: 0 });
    await user('noSettings', { tz: null }); // timezone never guessed
    await user('otherHour', { tz: 'America/New_York' }); // 15:00 there
    await user('badTz', { tz: 'Mars/Olympus_Mons' }); // skipped, does not break the query
    expect(await due('STREAK_SAVER', LONDON_8PM)).toEqual(sorted([due1, shield]));
    // Neither at 19:00 nor 21:00 London time.
    expect(await due('STREAK_SAVER', '2026-10-14T18:00:00Z')).toEqual([]);
    expect(await due('STREAK_SAVER', '2026-10-14T20:00:00Z')).toEqual([]);
  });

  it('uses each user\'s own zone: Tokyo, Los Angeles and Kolkata at their 20:00', async () => {
    const tokyo = await user('tokyo', { tz: 'Asia/Tokyo', lastActive: '2026-10-13' });
    const la = await user('la', { tz: 'America/Los_Angeles', lastActive: '2026-10-14' });
    const kolkata = await user('kolkata', { tz: 'Asia/Kolkata', lastActive: '2026-10-13' });
    // 11:00Z = 20:00 Tokyo (UTC+9).
    expect(await due('STREAK_SAVER', '2026-10-14T11:00:00Z')).toEqual([tokyo]);
    // 03:00Z on the 15th = 20:00 on the 14th in LA (PDT). Trained 13 Oct 18:00 PDT, which
    // was filed under UTC 14 Oct: not trained this local day, nothing yet for UTC 15 Oct.
    await logQuest(la, '2026-10-14T01:00:00Z', '2026-10-14');
    expect(await due('STREAK_SAVER', '2026-10-15T03:00:00Z')).toEqual([la]);
    // Kolkata is UTC+5:30: the minute-0 run at 15:00Z is 20:30 local.
    expect(await due('STREAK_SAVER', '2026-10-14T15:00:00Z')).toEqual([kolkata]);
    expect(await due('STREAK_SAVER', '2026-10-14T14:00:00Z')).toEqual([]);
  });

  it('never nags someone who trained this local day, even if it was filed under another UTC date', async () => {
    // Tokyo user trained at 08:00 local on 14 Oct = 23:00Z on 13 Oct (date_key 13 Oct).
    const tokyo = await user('tokyo', { tz: 'Asia/Tokyo', lastActive: '2026-10-13' });
    await logQuest(tokyo, '2026-10-13T23:00:00Z', '2026-10-13');
    expect(await due('STREAK_SAVER', '2026-10-14T11:00:00Z')).toEqual([]);
    // LA user trained 14 Oct 10:00 PDT (17:00Z, date_key 14 Oct): at 20:00 PDT the UTC date is
    // already the 15th, but they trained today locally, so no push.
    const la = await user('la', { tz: 'America/Los_Angeles', lastActive: '2026-10-14' });
    await logQuest(la, '2026-10-14T17:00:00Z', '2026-10-14');
    expect(await due('STREAK_SAVER', '2026-10-15T03:00:00Z')).toEqual([]);
  });

  it('respects daylight saving time (London on GMT after 25 Oct)', async () => {
    const id = await user('london', { lastActive: '2026-11-01' });
    expect(await due('STREAK_SAVER', '2026-11-02T20:00:00Z')).toEqual([id]); // 20:00 GMT
    expect(await due('STREAK_SAVER', '2026-11-02T19:00:00Z')).toEqual([]);
  });
});

describe('recipient selection: DAILY_REMINDER', () => {
  it('fires at the chosen local hour only when nothing was done today', async () => {
    const nine = await user('nine', { dailyHour: 9, streak: 0, lastActive: null });
    const trained = await user('trained', { dailyHour: 9 });
    await logQuest(trained, '2026-10-14T06:30:00Z', '2026-10-14'); // 07:30 London
    await user('none', { dailyHour: null });
    // 08:00Z = 09:00 London.
    expect(await due('DAILY_REMINDER', '2026-10-14T08:00:00Z')).toEqual([nine]);
    expect(await due('DAILY_REMINDER', '2026-10-14T09:00:00Z')).toEqual([]);
  });

  it('is skipped when the streak saver already went out that local day (no double push)', async () => {
    const both = await user('both', { dailyHour: 20, lastActive: '2026-10-13' });
    const t = '2026-10-14T19:00:00Z';
    expect(await due('DAILY_REMINDER', t)).toEqual([both]);
    expect((await claim('STREAK_SAVER', t)).map((r) => r.user_id)).toEqual([both]);
    expect(await due('DAILY_REMINDER', t)).toEqual([]);
  });
});

describe('claim_due_notifications: idempotent ledger', () => {
  const T = '2026-10-14T19:00:00Z';

  it('claims each user once per kind and local date, returning all their tokens', async () => {
    const a = await user('a', { tokens: 2, streak: 12 });
    const b = await user('b');
    const first = await claim('STREAK_SAVER', T);
    expect(sorted(first.map((r) => r.user_id))).toEqual(sorted([a, b]));
    const ra = first.find((r) => r.user_id === a)!;
    expect(ra.streak_days).toBe(12);
    expect(ra.tokens).toHaveLength(2);
    expect(ra.tokens.every((tk) => tk.startsWith('ExponentPushToken['))).toBe(true);
    // Job runs twice in the same hour: nobody is claimed again.
    expect(await claim('STREAK_SAVER', T)).toEqual([]);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM notification_log WHERE kind = 'STREAK_SAVER'`);
    expect(rows[0].n).toBe(2);
  });

  it('release_notification_claims frees failed sends for a retry', async () => {
    const a = await user('a');
    const b = await user('b');
    const claimed = await claim('STREAK_SAVER', T);
    expect(claimed).toHaveLength(2);
    await as('service_role');
    const { rows } = await db.query<{ n: number }>(
      `SELECT public.release_notification_claims('STREAK_SAVER', $1::uuid[], $2::date[]) AS n`,
      [[a], ['2026-10-14']],
    );
    expect(rows[0].n).toBe(1);
    expect((await claim('STREAK_SAVER', T)).map((r) => r.user_id)).toEqual([a]);
    expect((await claim('STREAK_SAVER', T)).map((r) => r.user_id)).not.toContain(b);
  });

  it('a new local day is a new claim', async () => {
    const a = await user('a', { lastActive: '2026-10-13' });
    expect(await claim('STREAK_SAVER', T)).toHaveLength(1);
    await db.query(`UPDATE profiles SET last_active_date = '2026-10-14' WHERE id = $1`, [a]);
    expect((await claim('STREAK_SAVER', '2026-10-15T19:00:00Z')).map((r) => r.user_id)).toEqual([a]);
  });

  it('prune keeps recent ledger rows and removes stale ones', async () => {
    const a = await user('a');
    await db.query(
      `INSERT INTO notification_log (user_id, kind, local_date) VALUES ($1, 'STREAK_SAVER', (now() AT TIME ZONE 'UTC')::date - 40), ($1, 'STREAK_SAVER', (now() AT TIME ZONE 'UTC')::date)`,
      [a],
    );
    await db.query(`INSERT INTO push_tickets (ticket_id, token, created_at) VALUES ('old', 't', now() - interval '3 days'), ('new', 't', now())`);
    await db.query(`SELECT private.prune_notification_data()`);
    expect((await db.query(`SELECT 1 FROM notification_log`)).rows).toHaveLength(1);
    expect((await db.query<{ ticket_id: string }>(`SELECT ticket_id FROM push_tickets`)).rows).toEqual([{ ticket_id: 'new' }]);
  });
});
