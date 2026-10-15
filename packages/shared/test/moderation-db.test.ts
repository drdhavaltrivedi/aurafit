/**
 * PGlite tests for supabase/migrations/20261014140000_moderation.sql: reports (one open report per
 * reporter + target), the hidden-drop filter (RLS + creator/admin visibility), suspension (ledger
 * backstop trigger), aura revert correctness, role guardrails (self / last admin / system profile),
 * squad name reset, creator badges, suspicious-aura flags (kept in sync with auraFlagKinds), the
 * append-only audit log, and privileges / RLS on every new object.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AURA_FLAG_DEFAULTS, auraFlagKinds, type AuraFlagMetrics } from '../src/index';
import { as as asRole, attempt as tryQuery, createDb, type DbRole } from './pglite-helpers';

let db: PGlite;
const as = (role: DbRole, sub = '') => asRole(db, role, sub);
const attempt = (sql: string, params: unknown[] = []) => tryQuery(db, sql, params);

type Result = Record<string, unknown> & { status: string };
type Role = 'MEMBER' | 'CREATOR' | 'ADMIN';

let seq = 0;
async function user(name: string, role: Role = 'MEMBER'): Promise<{ authId: string; id: string; handle: string }> {
  await as(null);
  seq += 1;
  const authId = `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`;
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [authId, `${name}${seq}@example.com`]);
  if (role !== 'MEMBER') await db.query(`UPDATE profiles SET role = $2 WHERE auth_id = $1`, [authId, role]);
  const { rows } = await db.query<{ id: string; handle: string }>(`SELECT id, handle FROM profiles WHERE auth_id = $1`, [authId]);
  return { authId, id: rows[0].id, handle: rows[0].handle };
}

async function call(sql: string, params: unknown[] = []): Promise<Result> {
  await as('service_role');
  try {
    const { rows } = await db.query<{ r: Result }>(`SELECT ${sql} AS r`, params);
    return rows[0].r;
  } finally {
    await as(null);
  }
}

async function makeDrop(id: string, creatorId: string, duration = 10) {
  await as(null);
  await db.query(
    `INSERT INTO workout_drops (id, title, creator_id, vibe_tag, duration_minutes, calories_burn_estimate, xp_points)
     VALUES ($1, $2, $3, 'VIBE', $4, 50, 100)`,
    [id, `Drop ${id}`, creatorId, duration],
  );
}

async function audit(action?: string): Promise<Array<{ actor_id: string; action: string; target_type: string; target_id: string; details: Record<string, unknown> }>> {
  await as(null);
  const { rows } = await db.query<{ actor_id: string; action: string; target_type: string; target_id: string; details: Record<string, unknown> }>(
    `SELECT actor_id, action, target_type, target_id, details FROM admin_audit_log ${action ? 'WHERE action = $1' : ''} ORDER BY created_at, id`,
    action ? [action] : [],
  );
  return rows;
}

async function visibleDrops(role: DbRole, sub = ''): Promise<string[]> {
  await as(role, sub);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM workout_drops WHERE id LIKE 'mod\\_%' ORDER BY id`);
  await as(null);
  return rows.map((r) => r.id);
}

async function profile(id: string) {
  await as(null);
  const { rows } = await db.query<Record<string, number | string | null>>(
    `SELECT aura_points::int AS aura, weekly_aura_gained::int AS weekly, total_workouts, str_stat, agi_stat, end_stat, rec_stat,
            streak_days, last_active_date::text AS last_active, rank, role, suspended_at, suspension_reason
     FROM profiles WHERE id = $1`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await as(null);
  // The audit log is append-only even for the owner; tests start from a clean slate via the
  // retention escape hatch (same GUC the prune function uses), in one transaction.
  await db.exec(`
    BEGIN;
    SELECT set_config('aurafit.audit_prune', 'on', true);
    DELETE FROM admin_audit_log;
    COMMIT;
    DELETE FROM content_reports;
    DELETE FROM workout_drops WHERE id LIKE 'mod\\_%';
    DELETE FROM squads;
    DELETE FROM auth.users;
  `);
});

describe('schema, privileges and RLS', () => {
  it('new tables have RLS on and no client privileges', async () => {
    await as(null);
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('content_reports', 'admin_audit_log')`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role, role === 'authenticated' ? '00000000-0000-4000-a000-000000000999' : '');
      for (const t of ['content_reports', 'admin_audit_log']) {
        expect((await attempt(`SELECT 1 FROM ${t}`)).error, `${role} select ${t}`).toMatch(/permission denied/);
      }
      expect((await attempt(`INSERT INTO content_reports (reporter_id, target_type, target_id, reason) VALUES (gen_random_uuid(), 'DROP', 'x', 'SPAM')`)).error).toMatch(
        /permission denied/,
      );
    }
    await as(null);
  });

  it('every new public function is SECURITY INVOKER and executable by service_role only', async () => {
    await as(null);
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; anon: boolean; auth: boolean; svc: boolean }>(
      `SELECT p.proname, p.prosecdef,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
              has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
         AND (p.proname LIKE 'admin\\_%' OR p.proname IN ('submit_report', 'get_account_moderation'))`,
    );
    expect(rows.map((r) => r.proname).sort()).toEqual(
      [
        'admin_audit_entries', 'admin_clear_flag', 'admin_dismiss_reports', 'admin_flagged_users', 'admin_hide_drop',
        'admin_moderation_queue', 'admin_reset_squad_name', 'admin_restore_drop', 'admin_revert_log', 'admin_search_users',
        'admin_set_creator_badge', 'admin_set_role', 'admin_suspend_user', 'admin_unsuspend_user', 'admin_user_summary',
        'get_account_moderation', 'submit_report',
      ].sort(),
    );
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(false);
      expect([r.anon, r.auth, r.svc], r.proname).toEqual([false, false, true]);
    }
  });

  it('suspension / flag columns are not readable or writable by API roles', async () => {
    const m = await user('cols');
    await as('authenticated', m.authId);
    expect((await attempt(`SELECT suspended_at FROM profiles`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT aura_flags_cleared_at FROM profiles`)).error).toMatch(/permission denied/);
    expect((await attempt(`UPDATE profiles SET suspended_at = NULL WHERE id = $1`, [m.id])).error).toMatch(/permission denied/);
    await as('anon');
    expect((await attempt(`SELECT suspension_reason FROM profiles`)).error).toMatch(/permission denied/);
    await as(null);
  });

  it('creators cannot change moderation columns through the Data API', async () => {
    const c = await user('crea', 'CREATOR');
    await makeDrop('mod_cols', c.id);
    await as('authenticated', c.authId);
    expect((await attempt(`UPDATE workout_drops SET moderation_status = 'HIDDEN' WHERE id = 'mod_cols'`)).error).toMatch(/permission denied/);
    expect((await attempt(`UPDATE workout_drops SET hidden_reason = 'x' WHERE id = 'mod_cols'`)).error).toMatch(/permission denied/);
    await as(null);
  });
});

describe('audit log is append-only', () => {
  it('service_role can insert and read but never update or delete; the owner is blocked by the trigger', async () => {
    const admin = await user('aud', 'ADMIN');
    await as('service_role');
    await db.query(`SELECT private.write_admin_audit($1::uuid, 'FLAG_CLEARED', 'USER', $2::text, '{}'::jsonb)`, [admin.id, admin.id]);
    expect((await db.query(`SELECT 1 FROM admin_audit_log`)).rows).toHaveLength(1);
    expect((await attempt(`UPDATE admin_audit_log SET action = 'DROP_HIDDEN'`)).error).toMatch(/permission denied/);
    expect((await attempt(`DELETE FROM admin_audit_log`)).error).toMatch(/permission denied/);
    expect((await attempt(`TRUNCATE admin_audit_log`)).error).toMatch(/permission denied/);
    expect((await attempt(`SELECT private.prune_admin_audit_log()`)).error).toMatch(/permission denied/);
    await as(null);
    expect((await attempt(`UPDATE admin_audit_log SET action = 'DROP_HIDDEN'`)).error).toMatch(/append-only/);
    expect((await attempt(`DELETE FROM admin_audit_log`)).error).toMatch(/append-only/);
    expect((await attempt(`TRUNCATE admin_audit_log`)).error).toMatch(/append-only/);
  });

  it('retention keeps at least 365 days, whatever interval is requested', async () => {
    await as(null);
    await db.exec(`
      INSERT INTO admin_audit_log (action, target_type, target_id, created_at) VALUES
        ('FLAG_CLEARED', 'USER', 'old', NOW() - INTERVAL '500 days'),
        ('FLAG_CLEARED', 'USER', 'recent', NOW() - INTERVAL '30 days');
    `);
    const { rows } = await db.query<{ n: number }>(`SELECT private.prune_admin_audit_log(INTERVAL '1 day') AS n`);
    expect(rows[0].n).toBe(1);
    expect((await db.query<{ target_id: string }>(`SELECT target_id FROM admin_audit_log`)).rows.map((r) => r.target_id)).toEqual(['recent']);
    // The escape hatch is transaction-local: deletes are blocked again afterwards.
    expect((await attempt(`DELETE FROM admin_audit_log`)).error).toMatch(/append-only/);
  });
});

describe('reports', () => {
  it('one open report per (reporter, target); reporting again is possible after resolution', async () => {
    const creator = await user('creator', 'CREATOR');
    const reporter = await user('reporter');
    const admin = await user('admin', 'ADMIN');
    await makeDrop('mod_spam', creator.id);
    const submit = () => call(`public.submit_report($1, 'DROP', 'mod_spam', 'SPAM', $2)`, [reporter.id, '  looks like an ad  ']);

    const first = await submit();
    expect(first.status).toBe('created');
    expect((await submit()).status).toBe('already_reported');
    expect((await call(`public.submit_report($1, 'DROP', 'mod_spam', 'OTHER', NULL)`, [reporter.id])).status).toBe('already_reported');

    await as(null);
    const { rows } = await db.query<{ note: string; status: string }>(`SELECT note, status FROM content_reports`);
    expect(rows).toEqual([{ note: 'looks like an ad', status: 'OPEN' }]);

    expect((await call(`public.admin_dismiss_reports($1, 'DROP', 'mod_spam', 'not spam')`, [admin.id])).status).toBe('dismissed');
    expect((await submit()).status).toBe('created');
  });

  it('rejects own content, unknown targets and invalid input', async () => {
    const creator = await user('creator', 'CREATOR');
    const other = await user('other');
    await makeDrop('mod_own', creator.id);
    expect((await call(`public.submit_report($1, 'DROP', 'mod_own', 'SPAM')`, [creator.id])).status).toBe('cannot_report_own');
    expect((await call(`public.submit_report($1, 'DROP', 'mod_nope', 'SPAM')`, [other.id])).status).toBe('target_not_found');
    expect((await call(`public.submit_report($1, 'SQUAD', 'not-a-uuid', 'SPAM')`, [other.id])).status).toBe('target_not_found');
    expect((await call(`public.submit_report($1, 'DROP', 'mod_own', 'BAD')`, [other.id])).status).toBe('invalid');
    expect((await call(`public.submit_report($1, 'DROP', 'mod_own', 'SPAM', $2)`, [other.id, 'x'.repeat(501)])).status).toBe('invalid');

    const sq = await call(`public.create_squad($1, 'Rude Name', 'RUDE', 'swords')`, [creator.id]);
    const squadId = sq.squad_id as string;
    expect((await call(`public.submit_report($1, 'SQUAD', $2, 'INAPPROPRIATE')`, [creator.id, squadId])).status).toBe('cannot_report_own');
    expect((await call(`public.submit_report($1, 'SQUAD', $2, 'INAPPROPRIATE')`, [other.id, squadId])).status).toBe('created');
  });

  it('the queue groups open reports by target with counts, reasons and a preview — never reporter ids', async () => {
    const creator = await user('creator', 'CREATOR');
    const admin = await user('admin', 'ADMIN');
    const a = await user('a');
    const b = await user('b');
    await makeDrop('mod_queue', creator.id);
    await call(`public.submit_report($1, 'DROP', 'mod_queue', 'SPAM')`, [a.id]);
    await call(`public.submit_report($1, 'DROP', 'mod_queue', 'UNSAFE_EXERCISE', 'knees')`, [b.id]);

    const member = await call(`public.admin_moderation_queue($1)`, [a.id]);
    expect(member.status).toBe('forbidden');

    const q = await call(`public.admin_moderation_queue($1)`, [admin.id]);
    expect(q.status).toBe('ok');
    expect(q.total_targets).toBe(1);
    const [item] = q.items as Array<Record<string, unknown>>;
    expect(item).toMatchObject({ target_type: 'DROP', target_id: 'mod_queue', open_count: 2, reason_counts: { SPAM: 1, UNSAFE_EXERCISE: 1 } });
    expect((item.drop as Record<string, unknown>).creator_handle).toBe(creator.handle);
    expect(item.latest).toHaveLength(2);
    const json = JSON.stringify(q);
    expect(json).not.toContain(a.id);
    expect(json).not.toContain(b.id);
  });
});

describe('hidden drops', () => {
  it('hiding removes a drop from public reads; its creator and admins still see it; restore brings it back; audited', async () => {
    const creator = await user('creator', 'CREATOR');
    const member = await user('member');
    const admin = await user('admin', 'ADMIN');
    await makeDrop('mod_a', creator.id);
    await makeDrop('mod_b', creator.id);
    await call(`public.submit_report($1, 'DROP', 'mod_a', 'INAPPROPRIATE')`, [member.id]);

    expect((await call(`public.admin_hide_drop($1, 'mod_a', '')`, [admin.id])).status).toBe('invalid');
    expect((await call(`public.admin_hide_drop($1, 'mod_a', 'Offensive title')`, [member.id])).status).toBe('forbidden');
    const hidden = await call(`public.admin_hide_drop($1, 'mod_a', ' Offensive title ')`, [admin.id]);
    expect(hidden).toEqual({ status: 'hidden', resolved_reports: 1 });
    expect((await call(`public.admin_hide_drop($1, 'mod_a', 'again')`, [admin.id])).status).toBe('already_hidden');

    // Public listing filter (separate WHERE clause, as the API applies it with the secret key).
    await as('service_role');
    const listing = await db.query<{ id: string }>(`SELECT id FROM workout_drops WHERE id LIKE 'mod\\_%' AND moderation_status = 'PUBLISHED' ORDER BY id`);
    expect(listing.rows.map((r) => r.id)).toEqual(['mod_b']);

    // Data API (RLS).
    expect(await visibleDrops('anon')).toEqual(['mod_b']);
    expect(await visibleDrops('authenticated', member.authId)).toEqual(['mod_b']);
    expect(await visibleDrops('authenticated', creator.authId)).toEqual(['mod_a', 'mod_b']);
    expect(await visibleDrops('authenticated', admin.authId)).toEqual(['mod_a', 'mod_b']);

    // The creator sees the reason (and nothing about who reported it).
    const mine = await call(`public.get_account_moderation($1)`, [creator.id]);
    expect(mine).toMatchObject({ status: 'ok', suspended: false, hidden_drops: [{ id: 'mod_a', hidden_reason: 'Offensive title' }] });
    expect(JSON.stringify(mine)).not.toContain(member.id);

    await as(null);
    expect((await db.query<{ status: string }>(`SELECT status FROM content_reports`)).rows).toEqual([{ status: 'ACTIONED' }]);

    expect((await call(`public.admin_restore_drop($1, 'mod_a')`, [admin.id])).status).toBe('restored');
    expect((await call(`public.admin_restore_drop($1, 'mod_a')`, [admin.id])).status).toBe('not_hidden');
    expect(await visibleDrops('anon')).toEqual(['mod_a', 'mod_b']);

    const log = await audit();
    expect(log.map((e) => [e.action, e.target_type, e.target_id, e.actor_id])).toEqual([
      ['DROP_HIDDEN', 'DROP', 'mod_a', admin.id],
      ['DROP_RESTORED', 'DROP', 'mod_a', admin.id],
    ]);
    expect(log[0].details).toMatchObject({ reason: 'Offensive title', resolved_reports: 1 });
  });

  it('the hidden-state CHECK keeps status, reason and timestamp consistent', async () => {
    const creator = await user('creator', 'CREATOR');
    await makeDrop('mod_chk', creator.id);
    expect((await attempt(`UPDATE workout_drops SET moderation_status = 'HIDDEN' WHERE id = 'mod_chk'`)).error).toMatch(/hidden_state_check/);
    expect((await attempt(`UPDATE workout_drops SET moderation_status = 'GONE' WHERE id = 'mod_chk'`)).error).toMatch(/moderation_status_check/);
  });
});

describe('suspension', () => {
  it('suspended users cannot log completions (ledger backstop); unsuspend restores; guards + audit', async () => {
    const admin = await user('admin', 'ADMIN');
    const member = await user('member');
    const otherAdmin = await user('admin2', 'ADMIN');

    expect((await call(`public.admin_suspend_user($1, $2, '')`, [admin.id, member.id])).status).toBe('invalid');
    expect((await call(`public.admin_suspend_user($1, $1, 'x')`, [admin.id])).status).toBe('cannot_suspend_self');
    expect((await call(`public.admin_suspend_user($1, $2, 'x')`, [admin.id, otherAdmin.id])).status).toBe('cannot_suspend_admin');
    await as(null);
    const sys = (await db.query<{ id: string }>(`SELECT id FROM profiles WHERE handle = '@aurafit' AND auth_id IS NULL`)).rows[0].id;
    expect((await call(`public.admin_suspend_user($1, $2, 'x')`, [admin.id, sys])).status).toBe('system_profile');

    expect((await call(`public.admin_suspend_user($1, $2, 'Botting')`, [admin.id, member.id])).status).toBe('suspended');
    expect((await call(`public.admin_suspend_user($1, $2, 'Botting')`, [admin.id, member.id])).status).toBe('already_suspended');
    expect(await profile(member.id)).toMatchObject({ suspension_reason: 'Botting' });

    await as('service_role');
    expect((await attempt(`SELECT public.complete_quest($1, 'q_daily_1', 100)`, [member.id])).error).toMatch(/suspended/);
    await as(null);
    expect((await profile(member.id)).aura).toBe(0);
    expect((await call(`public.get_account_moderation($1)`, [member.id])).suspended).toBe(true);

    expect((await call(`public.admin_unsuspend_user($1, $2)`, [admin.id, member.id])).status).toBe('unsuspended');
    expect((await call(`public.admin_unsuspend_user($1, $2)`, [admin.id, member.id])).status).toBe('not_suspended');
    expect((await call(`public.complete_quest($1, 'q_daily_1', 100)`, [member.id])).status).toBe('completed');

    expect((await audit()).map((e) => e.action)).toEqual(['USER_SUSPENDED', 'USER_UNSUSPENDED']);
  });

  it('a suspended admin actor is no longer an admin for any admin_* function', async () => {
    const admin = await user('admin', 'ADMIN');
    const member = await user('member');
    await as(null);
    await db.query(`UPDATE profiles SET suspended_at = NOW(), suspension_reason = 'test' WHERE id = $1`, [admin.id]);
    expect((await call(`public.admin_suspend_user($1, $2, 'x')`, [admin.id, member.id])).status).toBe('forbidden');
    expect((await call(`public.admin_moderation_queue($1)`, [admin.id])).status).toBe('forbidden');
  });
});

describe('revert aura', () => {
  it('reverts one quest completion: aura, weekly, total, stat; streak untouched; audited with before/after', async () => {
    const admin = await user('admin', 'ADMIN');
    const m = await user('cheater');
    await as(null);
    await db.query(`UPDATE profiles SET str_stat = 60 WHERE id = $1`, [m.id]);
    expect((await call(`public.complete_quest($1, 'q_daily_1', 300)`, [m.id])).status).toBe('completed'); // str +3
    expect((await call(`public.complete_quest($1, 'q_daily_2', 400)`, [m.id])).status).toBe('completed'); // agi +5
    const before = await profile(m.id);
    expect(before).toMatchObject({ aura: 700, weekly: 700, total_workouts: 2, str_stat: 63, agi_stat: 55, streak_days: 1 });

    await as(null);
    const log = (await db.query<{ id: string }>(`SELECT id FROM user_quest_logs WHERE user_id = $1 AND quest_id = 'q_daily_1'`, [m.id])).rows[0].id;
    const r = await call(`public.admin_revert_log($1, $2, 'QUEST', $3, 'duplicate tap')`, [admin.id, m.id, log]);
    expect(r).toMatchObject({ status: 'reverted', aura_removed: 300 });
    const after = await profile(m.id);
    expect(after).toMatchObject({ aura: 400, weekly: 400, total_workouts: 1, str_stat: 60, agi_stat: 55, streak_days: 1, last_active: before.last_active });

    expect((await call(`public.admin_revert_log($1, $2, 'QUEST', $3)`, [admin.id, m.id, log])).status).toBe('not_found');
    const [entry] = await audit('AURA_REVERTED');
    expect(entry).toMatchObject({ target_type: 'QUEST_LOG', target_id: log, actor_id: admin.id });
    expect(entry.details).toMatchObject({ kind: 'QUEST', item_id: 'q_daily_1', aura_earned: 300, note: 'duplicate tap', before: { aura_points: 700 }, after: { aura_points: 400 } });
  });

  it('reverts a workout (stats + completions_count), floors at 0, and only touches the given user', async () => {
    const admin = await user('admin', 'ADMIN');
    const creator = await user('creator', 'CREATOR');
    const m = await user('runner');
    const other = await user('bystander');
    await makeDrop('mod_run', creator.id);
    expect((await call(`public.complete_workout($1, 'mod_run', 500)`, [m.id])).status).toBe('completed');
    await as(null);
    const log = (await db.query<{ id: string }>(`SELECT id FROM user_workout_logs WHERE user_id = $1`, [m.id])).rows[0].id;
    // Someone else's id never matches.
    expect((await call(`public.admin_revert_log($1, $2, 'WORKOUT', $3)`, [admin.id, other.id, log])).status).toBe('not_found');
    expect((await call(`public.admin_revert_log($1, $2, 'QUEST', $3)`, [admin.id, m.id, log])).status).toBe('not_found');
    // Aura spent elsewhere (or reset): the subtraction is floored at 0 and rank follows.
    await db.query(`UPDATE profiles SET aura_points = 200, weekly_aura_gained = 0 WHERE id = $1`, [m.id]);

    expect((await call(`public.admin_revert_log($1, $2, 'WORKOUT', $3)`, [admin.id, m.id, log])).status).toBe('reverted');
    expect(await profile(m.id)).toMatchObject({ aura: 0, weekly: 0, total_workouts: 0, str_stat: 50, agi_stat: 50, end_stat: 50, rank: 'E-RANK' });
    await as(null);
    expect((await db.query<{ c: number }>(`SELECT completions_count AS c FROM workout_drops WHERE id = 'mod_run'`)).rows[0].c).toBe(0);
    expect((await call(`public.admin_revert_log($1, $2, 'WORKOUT', $3)`, [creator.id, m.id, log])).status).toBe('forbidden');
  });
});

describe('roles', () => {
  it('admin_set_role: member actors are forbidden, no self change, system profiles locked, audited', async () => {
    const admin = await user('admin', 'ADMIN');
    const member = await user('member');
    expect((await call(`public.admin_set_role($1, $2, 'ADMIN')`, [member.id, member.id])).status).toBe('forbidden');
    expect((await call(`public.admin_set_role($1, $1, 'MEMBER')`, [admin.id])).status).toBe('cannot_change_self');
    await as(null);
    const sys = (await db.query<{ id: string }>(`SELECT id FROM profiles WHERE handle = '@aurafit' AND auth_id IS NULL`)).rows[0].id;
    expect((await call(`public.admin_set_role($1, $2, 'MEMBER')`, [admin.id, sys])).status).toBe('system_profile');

    const up = await call(`public.admin_set_role($1, $2, 'CREATOR')`, [admin.id, member.id]);
    expect(up.status).toBe('updated');
    expect(up.profile).not.toHaveProperty('auth_id');
    expect((await call(`public.admin_set_role($1, $2, 'CREATOR')`, [admin.id, member.id])).status).toBe('unchanged');
    const [e] = await audit('ROLE_CHANGED');
    expect(e).toMatchObject({ actor_id: admin.id, target_type: 'USER', target_id: member.id, details: { from: 'MEMBER', to: 'CREATOR' } });
    expect(await audit()).toHaveLength(1);
  });

  it('two admins: one can demote the other, who then loses admin powers; the last ADMIN can never be removed', async () => {
    const a = await user('alpha', 'ADMIN');
    const b = await user('bravo', 'ADMIN');
    expect((await call(`public.admin_set_role($1, $2, 'MEMBER')`, [a.id, b.id])).status).toBe('updated');
    expect((await call(`public.admin_set_role($1, $2, 'MEMBER')`, [b.id, a.id])).status).toBe('forbidden');
    expect((await profile(a.id)).role).toBe('ADMIN');

    // Database-level guard (any writer, even ad-hoc service_role SQL).
    await as('service_role');
    expect((await attempt(`UPDATE profiles SET role = 'MEMBER' WHERE id = $1`, [a.id])).error).toMatch(/last ADMIN/);
    await as(null);
    expect((await profile(a.id)).role).toBe('ADMIN');
    // With a second admin, the first may be demoted.
    await db.query(`UPDATE profiles SET role = 'ADMIN' WHERE id = $1`, [b.id]);
    await db.query(`UPDATE profiles SET role = 'MEMBER' WHERE id = $1`, [a.id]);
    expect((await profile(a.id)).role).toBe('MEMBER');
  });

  it('search is admin-only, matches handle or name case-insensitively, escapes wildcards and paginates', async () => {
    const admin = await user('admin', 'ADMIN');
    await user('zed_one');
    await user('zed_two');
    await user('zed_three');
    expect((await call(`public.admin_search_users($1, 'zed')`, [(await user('nobody')).id])).status).toBe('forbidden');
    const p1 = await call(`public.admin_search_users($1, 'ZED', 2)`, [admin.id]);
    const handles1 = (p1.items as Array<{ handle: string }>).map((i) => i.handle);
    expect(handles1).toHaveLength(2);
    expect(p1.next_after).toBe(handles1[1]);
    const p2 = await call(`public.admin_search_users($1, 'zed', 2, $2)`, [admin.id, p1.next_after]);
    expect((p2.items as unknown[]).length).toBe(1);
    expect(p2.next_after).toBeNull();
    // '%' is a literal, not a wildcard.
    expect((await call(`public.admin_search_users($1, '%')`, [admin.id])).items).toEqual([]);

    const summary = await call(`public.admin_user_summary($1, $2)`, [admin.id, (p2.items as Array<{ id: string }>)[0].id]);
    expect(summary.status).toBe('ok');
    expect(summary).toMatchObject({ counts: { quest_logs: 0, workout_logs: 0 } });
  });
});

describe('squads and badges', () => {
  it('reset squad name: neutral "Squad <TAG>", new invite code, reports actioned, audited', async () => {
    const admin = await user('admin', 'ADMIN');
    const leader = await user('leader');
    const reporter = await user('reporter');
    const sq = await call(`public.create_squad($1, 'Very Rude Name', 'RUDE', 'swords')`, [leader.id]);
    const id = sq.squad_id as string;
    await as(null);
    const code = (await db.query<{ invite_code: string }>(`SELECT invite_code FROM squads WHERE id = $1`, [id])).rows[0].invite_code;
    await call(`public.submit_report($1, 'SQUAD', $2, 'INAPPROPRIATE')`, [reporter.id, id]);

    const r = await call(`public.admin_reset_squad_name($1, $2)`, [admin.id, id]);
    expect(r).toMatchObject({ status: 'reset', name: 'Squad RUDE', previous_name: 'Very Rude Name', resolved_reports: 1 });
    await as(null);
    const row = (await db.query<{ name: string; invite_code: string }>(`SELECT name, invite_code FROM squads WHERE id = $1`, [id])).rows[0];
    expect(row.name).toBe('Squad RUDE');
    expect(row.invite_code).not.toBe(code);
    const [e] = await audit('SQUAD_NAME_RESET');
    expect(e.details).toMatchObject({ previous_name: 'Very Rude Name', name: 'Squad RUDE' });
    expect((await call(`public.admin_reset_squad_name($1, gen_random_uuid())`, [admin.id])).status).toBe('not_found');
  });

  it('creator badge: verified creators only, <= 50 chars, null resets to the default', async () => {
    const admin = await user('admin', 'ADMIN');
    const creator = await user('creator', 'CREATOR');
    const member = await user('member');
    await makeDrop('mod_badge', creator.id);
    await makeDrop('mod_member', member.id);
    expect((await call(`public.admin_set_creator_badge($1, 'mod_badge', 'Certified  Coach')`, [admin.id])).badge).toBe('Certified Coach');
    expect((await call(`public.admin_set_creator_badge($1, 'mod_badge', $2)`, [admin.id, 'x'.repeat(51)])).status).toBe('invalid');
    expect((await call(`public.admin_set_creator_badge($1, 'mod_member', 'Pro')`, [admin.id])).status).toBe('not_verified_creator');
    expect((await call(`public.admin_set_creator_badge($1, 'mod_badge', NULL)`, [admin.id])).badge).toBe('Verified Creator');
    expect((await audit('CREATOR_BADGE_SET')).map((e) => e.details.to)).toEqual(['Certified Coach', 'Verified Creator']);
  });
});

describe('suspicious aura flags', () => {
  // Fixed instant in the past, so "Clear flag" (real clock) is always after the evidence.
  const NOW = '2026-03-10T18:00:00Z';
  const at = (minutesBefore: number) => new Date(Date.parse(NOW) - minutesBefore * 60_000).toISOString();

  async function workoutLog(userId: string, dropId: string, completedAt: string, aura = 200) {
    await as(null);
    await db.query(
      `INSERT INTO user_workout_logs (user_id, drop_id, aura_earned, completed_at, date_key) VALUES ($1, $2, $3, $4, ($4::timestamptz AT TIME ZONE 'UTC')::date)`,
      [userId, dropId, aura, completedAt],
    );
  }

  const flagged = (actor: string) =>
    call(
      `public.admin_flagged_users($1, $2::timestamptz, $3, $4, $5, $6, $7, $8)`,
      [actor, NOW, AURA_FLAG_DEFAULTS.burstPerHour, AURA_FLAG_DEFAULTS.dayAuraMin, AURA_FLAG_DEFAULTS.dayAuraMultiplier,
        AURA_FLAG_DEFAULTS.fastRatio, AURA_FLAG_DEFAULTS.fastMinCount, AURA_FLAG_DEFAULTS.lookbackDays],
    );

  it('flags bursts, impossible workout speed and day spikes with evidence; matches auraFlagKinds; clear flag hides them', async () => {
    const admin = await user('admin', 'ADMIN');
    const creator = await user('creator', 'CREATOR');
    const bot = await user('bot');
    const normal = await user('normal');
    for (let i = 0; i < 8; i++) await makeDrop(`mod_f${i}`, creator.id, 20);
    // bot: 8 x 20-minute workouts, 3 minutes apart, 600 aura each (4,800 today, no history).
    for (let i = 0; i < 8; i++) await workoutLog(bot.id, `mod_f${i}`, at(30 - i * 3), 600);
    // normal: two workouts hours apart.
    await workoutLog(normal.id, 'mod_f0', at(300));
    await workoutLog(normal.id, 'mod_f1', at(60));

    expect((await flagged(normal.id)).status).toBe('forbidden');
    const r = await flagged(admin.id);
    const items = r.items as Array<{ profile_id: string; flags: string[]; metrics: Record<string, number | null>; evidence: Array<Record<string, unknown>> }>;
    expect(items.map((i) => i.profile_id)).toEqual([bot.id]);
    const [hit] = items;
    expect(hit.flags).toEqual(['BURST', 'DAY_SPIKE', 'TOO_FAST']);
    expect(hit.metrics).toMatchObject({ completions: 8, max_per_hour: 8, today_aura: 4800, fast_count: 7, typical_daily_aura: null });
    expect(hit.evidence).toHaveLength(8);
    expect(hit.evidence.filter((e) => e.too_fast)).toHaveLength(7);
    expect(hit.evidence[0]).toMatchObject({ kind: 'WORKOUT', seconds_since_previous: 180, duration_minutes: 20 });

    // Shared TS rules agree with the SQL decision.
    const m: AuraFlagMetrics = {
      completions: hit.metrics.completions as number,
      maxPerHour: hit.metrics.max_per_hour as number,
      burstWindowStart: null,
      todayAura: hit.metrics.today_aura as number,
      typicalDailyAura: hit.metrics.typical_daily_aura as number | null,
      baselineDays: hit.metrics.baseline_days as number,
      fastCount: hit.metrics.fast_count as number,
    };
    expect(auraFlagKinds(m)).toEqual(hit.flags);

    expect((await call(`public.admin_clear_flag($1, $2, 'reviewed')`, [admin.id, bot.id])).status).toBe('cleared');
    // Clearing ignores activity up to "now" (real clock), which is after the test's fixed NOW.
    expect((await flagged(admin.id)).items).toEqual([]);
    expect((await audit('FLAG_CLEARED'))[0]).toMatchObject({ target_id: bot.id, details: { note: 'reviewed' } });
  });

  it('a day spike needs to beat the user baseline when one exists', async () => {
    const admin = await user('admin', 'ADMIN');
    const creator = await user('creator', 'CREATOR');
    const grinder = await user('grinder');
    for (let i = 0; i < 4; i++) await makeDrop(`mod_g${i}`, creator.id, 5);
    // 4 active days in the previous 2 weeks at ~1,500/day, then 4,400 today spread out.
    for (let d = 1; d <= 4; d++) await workoutLog(grinder.id, 'mod_g0', at(d * 24 * 60 + 60), 1500);
    for (let i = 0; i < 4; i++) await workoutLog(grinder.id, `mod_g${i}`, at(i * 120 + 10), 1100);
    let items = (await flagged(admin.id)).items as Array<{ flags: string[]; metrics: Record<string, number> }>;
    // 4,400 < 4 x 1,500: no spike, and nothing else suspicious.
    expect(items).toEqual([]);

    await as(null);
    await db.query(`UPDATE user_workout_logs SET aura_earned = 400 WHERE user_id = $1 AND completed_at < $2`, [grinder.id, at(24 * 60)]);
    items = (await flagged(admin.id)).items as Array<{ flags: string[]; metrics: Record<string, number> }>;
    expect(items).toHaveLength(1);
    expect(items[0].flags).toEqual(['DAY_SPIKE']);
    expect(items[0].metrics).toMatchObject({ today_aura: 4400, typical_daily_aura: 400, baseline_days: 4 });
  });
});

describe('audit entries', () => {
  it('filters by action / target and pages newest first with a keyset cursor', async () => {
    const admin = await user('admin', 'ADMIN');
    const creator = await user('creator', 'CREATOR');
    await makeDrop('mod_p1', creator.id);
    await makeDrop('mod_p2', creator.id);
    await call(`public.admin_hide_drop($1, 'mod_p1', 'r1')`, [admin.id]);
    await call(`public.admin_hide_drop($1, 'mod_p2', 'r2')`, [admin.id]);
    await call(`public.admin_restore_drop($1, 'mod_p1')`, [admin.id]);

    const page1 = await call(`public.admin_audit_entries($1, NULL, NULL, NULL, 2)`, [admin.id]);
    const items1 = page1.items as Array<{ action: string; target_id: string; actor_handle: string }>;
    expect(items1.map((i) => [i.action, i.target_id])).toEqual([
      ['DROP_RESTORED', 'mod_p1'],
      ['DROP_HIDDEN', 'mod_p2'],
    ]);
    expect(items1[0].actor_handle).toBe(admin.handle);
    const cursor = page1.next_before as { created_at: string; id: string };
    const page2 = await call(`public.admin_audit_entries($1, NULL, NULL, NULL, 2, $2::timestamptz, $3::uuid)`, [admin.id, cursor.created_at, cursor.id]);
    expect((page2.items as Array<{ target_id: string }>).map((i) => i.target_id)).toEqual(['mod_p1']);
    expect(page2.next_before).toBeNull();

    const hides = await call(`public.admin_audit_entries($1, 'DROP_HIDDEN')`, [admin.id]);
    expect((hides.items as unknown[]).length).toBe(2);
    const byTarget = await call(`public.admin_audit_entries($1, NULL, 'DROP', 'mod_p1')`, [admin.id]);
    expect((byTarget.items as unknown[]).length).toBe(2);
  });
});
