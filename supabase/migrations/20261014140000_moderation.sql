-- AuraFit admin moderation (applies on top of 20261014120000_squads.sql and, when present,
-- 20261014130000_creator_tools.sql; nothing here depends on the creator-tools objects).
--
--   1. workout_drops moderation state: moderation_status ('PUBLISHED' default | 'HIDDEN'),
--      hidden_reason / hidden_at / hidden_by. Public listings filter HIDDEN out with a separate
--      WHERE clause (server: GET /api/v1/drops etc.); a RESTRICTIVE RLS policy does the same for
--      Data API clients (creators still see their own hidden drops, admins see all).
--   2. profiles: suspended_at / suspension_reason / suspended_by (suspension) and
--      aura_flags_cleared_at ("Clear flag"). Server-only: not readable or writable by API roles.
--   3. public.content_reports: user reports of a workout drop or a squad. One OPEN report per
--      (reporter, target) via a partial unique index. Never exposed to clients; reporter
--      identities are never returned by any function (not even to admins).
--   4. public.admin_audit_log: append-only audit trail written by every admin action in the same
--      transaction. service_role may only SELECT/INSERT; an UPDATE/DELETE/TRUNCATE guard trigger
--      blocks even the table owner, except private.prune_admin_audit_log() (>= 365-day retention).
--   5. Guards: a BEFORE UPDATE OF role trigger keeps at least one ADMIN; a BEFORE INSERT trigger
--      on both completion ledgers rejects suspended profiles (backstop: the API answers
--      403 SUSPENDED before it ever calls complete_quest / complete_workout).
--   6. Server-only functions (SECURITY INVOKER, EXECUTE to service_role only; every admin_* one
--      re-checks that p_actor_id is a non-suspended ADMIN *in the database* and writes its audit
--      row in the same transaction): submit_report, get_account_moderation, admin_moderation_queue,
--      admin_hide_drop, admin_restore_drop, admin_dismiss_reports, admin_reset_squad_name,
--      admin_set_creator_badge, admin_set_role (replaced: guardrails + audit), admin_search_users,
--      admin_user_summary, admin_suspend_user, admin_unsuspend_user, admin_clear_flag,
--      admin_revert_log, admin_flagged_users, admin_audit_entries.
--
-- Revert semantics (admin_revert_log): deletes ONE ledger row and, atomically under the profile
-- lock, subtracts its aura from aura_points (floored at 0; rank follows via trg_profiles_rank),
-- from weekly_aura_gained only if the row is in the current ISO week (floored at 0), 1 from
-- total_workouts, the nominal stat reward (quest: its stat_reward_amount on its stat; workout:
-- STR 4 / AGI 4 / END 3, floored at 0), and 1 from the drop's completions_count. NOT reverted:
-- streak_days / streak_shields / last_active_date (the streak history cannot be recomputed
-- reliably), and stat points that were clipped at 100 when earned (the nominal amount is
-- subtracted, so a stat may end slightly lower than before the completion). Squad weekly aura is
-- computed from the ledgers, so it corrects itself.
--
-- Idempotent: safe to re-run (the PGlite tests apply every migration twice). Do not edit after it
-- has been applied; add a new migration instead (then run `npm run db:sync`).
-- Values mirror packages/shared/src/moderation.ts (REPORT_REASONS, *_MAX_LENGTH, AURA_FLAG_DEFAULTS).

-- ==========================================
-- 1. WORKOUT DROP MODERATION STATE
-- ==========================================
ALTER TABLE public.workout_drops ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE public.workout_drops ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.workout_drops ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.workout_drops ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.workout_drops DROP CONSTRAINT IF EXISTS workout_drops_moderation_status_check;
ALTER TABLE public.workout_drops ADD CONSTRAINT workout_drops_moderation_status_check
    CHECK (moderation_status IN ('PUBLISHED', 'HIDDEN'));
ALTER TABLE public.workout_drops DROP CONSTRAINT IF EXISTS workout_drops_hidden_reason_check;
ALTER TABLE public.workout_drops ADD CONSTRAINT workout_drops_hidden_reason_check
    CHECK (hidden_reason IS NULL OR char_length(btrim(hidden_reason)) BETWEEN 1 AND 500);
ALTER TABLE public.workout_drops DROP CONSTRAINT IF EXISTS workout_drops_hidden_state_check;
ALTER TABLE public.workout_drops ADD CONSTRAINT workout_drops_hidden_state_check
    CHECK ((moderation_status = 'HIDDEN') = (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL));

COMMENT ON COLUMN public.workout_drops.moderation_status IS 'PUBLISHED (default) or HIDDEN by an admin. Public listings must filter HIDDEN out. Server-written only (admin_hide_drop / admin_restore_drop).';
COMMENT ON COLUMN public.workout_drops.hidden_reason IS 'Admin-written reason shown to the drop''s creator ("Hidden by moderator: <reason>"). Never the reporter identity.';

-- Public listing: newest published drops (partial index matches the listing''s WHERE clause).
CREATE INDEX IF NOT EXISTS idx_workout_drops_published_created_at
    ON public.workout_drops (created_at DESC) WHERE moderation_status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_workout_drops_hidden_by ON public.workout_drops (hidden_by) WHERE hidden_by IS NOT NULL;

-- Never client-writable (no-op unless someone granted them; keeps re-runs strict).
REVOKE INSERT (moderation_status, hidden_reason, hidden_at, hidden_by) ON public.workout_drops FROM anon, authenticated;
REVOKE UPDATE (moderation_status, hidden_reason, hidden_at, hidden_by) ON public.workout_drops FROM anon, authenticated;

-- RESTRICTIVE policies are AND-ed with every permissive SELECT policy, so this composes with any
-- other visibility rule (e.g. scheduled drops) without rewriting those policies. Split per role:
-- anon cannot execute the private helpers.
DROP POLICY IF EXISTS "Hidden drops are invisible to anon" ON public.workout_drops;
CREATE POLICY "Hidden drops are invisible to anon" ON public.workout_drops
    AS RESTRICTIVE FOR SELECT TO anon
    USING (moderation_status = 'PUBLISHED');

DROP POLICY IF EXISTS "Hidden drops only visible to their creator and admins" ON public.workout_drops;
CREATE POLICY "Hidden drops only visible to their creator and admins" ON public.workout_drops
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        moderation_status = 'PUBLISHED'
        OR creator_id = (SELECT private.current_profile_id())
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

-- ==========================================
-- 2. PROFILES: SUSPENSION + FLAG REVIEW
-- ==========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aura_flags_cleared_at TIMESTAMPTZ;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_suspension_reason_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_suspension_reason_check
    CHECK (suspension_reason IS NULL OR char_length(btrim(suspension_reason)) BETWEEN 1 AND 500);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_suspension_state_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_suspension_state_check
    CHECK ((suspended_at IS NULL) = (suspension_reason IS NULL));

CREATE INDEX IF NOT EXISTS idx_profiles_suspended_by ON public.profiles (suspended_by) WHERE suspended_by IS NOT NULL;
-- Admin count for the last-admin guard.
CREATE INDEX IF NOT EXISTS idx_profiles_role_admin ON public.profiles (id) WHERE role = 'ADMIN';

COMMENT ON COLUMN public.profiles.suspended_at IS 'Set by admin_suspend_user. Suspended users get 403 SUSPENDED on mutating game endpoints. Server-only.';
COMMENT ON COLUMN public.profiles.aura_flags_cleared_at IS 'admin_clear_flag: activity at or before this instant is ignored by admin_flagged_users. Server-only.';

-- profiles uses column-level SELECT (launch hardening): nothing to revoke for SELECT unless granted;
-- be explicit anyway so a re-run never leaves these readable or writable by API roles.
REVOKE SELECT (suspended_at, suspension_reason, suspended_by, aura_flags_cleared_at) ON public.profiles FROM anon, authenticated;
REVOKE INSERT (suspended_at, suspension_reason, suspended_by, aura_flags_cleared_at) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (suspended_at, suspension_reason, suspended_by, aura_flags_cleared_at) ON public.profiles FROM anon, authenticated;

-- ==========================================
-- 3. CONTENT REPORTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('DROP', 'SQUAD')),
    target_id TEXT NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 100),
    reason TEXT NOT NULL CHECK (reason IN ('SPAM', 'INAPPROPRIATE', 'UNSAFE_EXERCISE', 'IMPERSONATION', 'OTHER')),
    note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DISMISSED', 'ACTIONED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT content_reports_target_id_format CHECK (
        (target_type = 'DROP' AND target_id ~ '^[A-Za-z0-9_-]+$')
        OR (target_type = 'SQUAD' AND target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    ),
    CONSTRAINT content_reports_resolution_state CHECK ((status = 'OPEN') = (resolved_at IS NULL))
);

COMMENT ON TABLE public.content_reports IS 'User reports (drop / squad). Server-only (POST /api/v1/reports). Reporter identities are never returned by any function.';

-- One OPEN report per (reporter, target); a resolved report allows a new one.
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_one_open_per_reporter
    ON public.content_reports (reporter_id, target_type, target_id) WHERE status = 'OPEN';
-- Moderation queue: open reports grouped by target.
CREATE INDEX IF NOT EXISTS idx_content_reports_open_target
    ON public.content_reports (target_type, target_id, created_at DESC) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_content_reports_resolved_by ON public.content_reports (resolved_by) WHERE resolved_by IS NOT NULL;

-- ==========================================
-- 4. ADMIN AUDIT LOG (append-only)
-- ==========================================
-- No foreign keys on purpose: an audit row must survive (unchanged) the deletion of its actor or
-- target. actor_handle is a snapshot for readability.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_handle TEXT,
    action TEXT NOT NULL CHECK (action IN (
        'DROP_HIDDEN', 'DROP_RESTORED', 'REPORTS_DISMISSED', 'SQUAD_NAME_RESET', 'CREATOR_BADGE_SET',
        'ROLE_CHANGED', 'USER_SUSPENDED', 'USER_UNSUSPENDED', 'FLAG_CLEARED', 'AURA_REVERTED'
    )),
    target_type TEXT NOT NULL CHECK (target_type IN ('DROP', 'SQUAD', 'USER', 'QUEST_LOG', 'WORKOUT_LOG')),
    target_id TEXT NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 100),
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE public.admin_audit_log IS 'Append-only admin audit trail. service_role: SELECT + INSERT only; UPDATE/DELETE/TRUNCATE blocked by trigger except private.prune_admin_audit_log().';

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_created ON public.admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log (target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.admin_audit_log_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('aurafit.audit_prune', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'admin_audit_log is append-only (% blocked)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_log_append_only ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_append_only BEFORE UPDATE OR DELETE ON public.admin_audit_log
    FOR EACH ROW EXECUTE FUNCTION private.admin_audit_log_guard();
DROP TRIGGER IF EXISTS trg_admin_audit_log_no_truncate ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_truncate BEFORE TRUNCATE ON public.admin_audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION private.admin_audit_log_guard();

-- Retention: deletes entries older than p_keep (never less than 365 days). SECURITY DEFINER (the
-- owner holds DELETE; service_role does not) in the non-exposed schema, EXECUTE revoked from every
-- API role including service_role: only the owner / pg_cron runs it.
CREATE OR REPLACE FUNCTION private.prune_admin_audit_log(p_keep INTERVAL DEFAULT INTERVAL '400 days')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_keep INTERVAL := greatest(coalesce(p_keep, INTERVAL '400 days'), INTERVAL '365 days');
    v_count INTEGER;
BEGIN
    PERFORM set_config('aurafit.audit_prune', 'on', true);
    DELETE FROM public.admin_audit_log WHERE created_at < NOW() - v_keep;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM set_config('aurafit.audit_prune', 'off', true);
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.admin_audit_log_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prune_admin_audit_log(INTERVAL) FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
        PERFORM cron.schedule(
            'aurafit-admin-audit-retention',
            '30 3 1 * *', -- 03:30 UTC on the 1st of every month
            'SELECT private.prune_admin_audit_log()'
        );
    ELSE
        RAISE NOTICE 'pg_cron is not available; admin audit retention job not scheduled';
    END IF;
END $$;

-- ==========================================
-- 5. PRIVILEGES + RLS (server-only tables)
-- ==========================================
REVOKE ALL ON public.content_reports, public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_audit_log FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_reports TO service_role;
GRANT SELECT, INSERT ON public.admin_audit_log TO service_role;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. GUARD TRIGGERS
-- ==========================================
-- At least one ADMIN must remain (covers every writer, including ad-hoc service_role SQL).
CREATE OR REPLACE FUNCTION private.keep_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF OLD.role = 'ADMIN' AND NEW.role IS DISTINCT FROM 'ADMIN'
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.role = 'ADMIN' AND p.id <> OLD.id) THEN
        RAISE EXCEPTION 'cannot remove the last ADMIN' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_keep_last_admin ON public.profiles;
CREATE TRIGGER trg_profiles_keep_last_admin BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION private.keep_last_admin();

-- Backstop for suspension: no completion ledger row for a suspended profile.
CREATE OR REPLACE FUNCTION private.reject_suspended_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.suspended_at IS NOT NULL) THEN
        RAISE EXCEPTION 'account is suspended' USING ERRCODE = 'insufficient_privilege', HINT = 'SUSPENDED';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_quest_logs_not_suspended ON public.user_quest_logs;
CREATE TRIGGER trg_user_quest_logs_not_suspended BEFORE INSERT ON public.user_quest_logs
    FOR EACH ROW EXECUTE FUNCTION private.reject_suspended_completion();
DROP TRIGGER IF EXISTS trg_user_workout_logs_not_suspended ON public.user_workout_logs;
CREATE TRIGGER trg_user_workout_logs_not_suspended BEFORE INSERT ON public.user_workout_logs
    FOR EACH ROW EXECUTE FUNCTION private.reject_suspended_completion();

REVOKE ALL ON FUNCTION private.keep_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reject_suspended_completion() FROM PUBLIC, anon, authenticated;

-- ==========================================
-- 7. PRIVATE HELPERS
-- ==========================================
-- True when p_actor_id is a login-capable, non-suspended ADMIN (read from the database).
CREATE OR REPLACE FUNCTION private.is_active_admin(p_actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_actor_id AND p.role = 'ADMIN' AND p.auth_id IS NOT NULL AND p.suspended_at IS NULL
    );
$$;

-- Appends one audit row (same transaction as the caller).
CREATE OR REPLACE FUNCTION private.write_admin_audit(
    p_actor_id UUID,
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.admin_audit_log (actor_id, actor_handle, action, target_type, target_id, details)
    VALUES (p_actor_id, (SELECT p.handle FROM public.profiles p WHERE p.id = p_actor_id), p_action, p_target_type,
            p_target_id, coalesce(p_details, '{}'::jsonb))
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Marks every OPEN report on a target as resolved; returns how many.
CREATE OR REPLACE FUNCTION private.resolve_reports(p_actor_id UUID, p_target_type TEXT, p_target_id TEXT, p_status TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.content_reports
    SET status = p_status, resolved_at = NOW(), resolved_by = p_actor_id
    WHERE target_type = p_target_type AND target_id = p_target_id AND status = 'OPEN';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.is_active_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.write_admin_audit(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_reports(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_admin(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION private.write_admin_audit(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION private.resolve_reports(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ==========================================
-- 8. USER-FACING FUNCTIONS (server-only)
-- ==========================================
-- Files a report. Statuses: created {report_id} | already_reported | target_not_found |
-- cannot_report_own | profile_not_found | invalid.
CREATE OR REPLACE FUNCTION public.submit_report(
    p_reporter_id UUID,
    p_target_type TEXT,
    p_target_id TEXT,
    p_reason TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_reporter public.profiles%ROWTYPE;
    v_owner UUID;
    v_id UUID;
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
    IF p_target_type NOT IN ('DROP', 'SQUAD')
       OR p_reason NOT IN ('SPAM', 'INAPPROPRIATE', 'UNSAFE_EXERCISE', 'IMPERSONATION', 'OTHER')
       OR (v_note IS NOT NULL AND char_length(v_note) > 500) THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT * INTO v_reporter FROM public.profiles WHERE id = p_reporter_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'profile_not_found');
    END IF;

    IF p_target_type = 'DROP' THEN
        SELECT d.creator_id INTO v_owner FROM public.workout_drops d WHERE d.id = p_target_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'target_not_found');
        END IF;
        IF v_owner = p_reporter_id THEN
            RETURN jsonb_build_object('status', 'cannot_report_own');
        END IF;
    ELSE
        IF p_target_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM public.squads s WHERE s.id = p_target_id::uuid) THEN
            RETURN jsonb_build_object('status', 'target_not_found');
        END IF;
        IF v_reporter.squad_id IS NOT NULL AND v_reporter.squad_id = p_target_id::uuid THEN
            RETURN jsonb_build_object('status', 'cannot_report_own');
        END IF;
    END IF;

    BEGIN
        INSERT INTO public.content_reports (reporter_id, target_type, target_id, reason, note)
        VALUES (p_reporter_id, p_target_type, p_target_id, p_reason, v_note)
        RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'already_reported');
    END;
    RETURN jsonb_build_object('status', 'created', 'report_id', v_id);
END;
$$;

-- The caller's own moderation state: suspension, and their drops hidden by a moderator (with the
-- admin-written reason; never who reported them).
CREATE OR REPLACE FUNCTION public.get_account_moderation(p_profile_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT CASE WHEN p.id IS NULL THEN jsonb_build_object('status', 'profile_not_found') ELSE jsonb_build_object(
        'status', 'ok',
        'suspended', p.suspended_at IS NOT NULL,
        'suspended_at', p.suspended_at,
        'suspension_reason', p.suspension_reason,
        'hidden_drops', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'hidden_reason', d.hidden_reason, 'hidden_at', d.hidden_at)
                             ORDER BY d.hidden_at DESC, d.id)
            FROM public.workout_drops d
            WHERE d.creator_id = p.id AND d.moderation_status = 'HIDDEN'
        ), '[]'::jsonb)
    ) END
    FROM (SELECT 1) one
    LEFT JOIN public.profiles p ON p.id = p_profile_id;
$$;

-- ==========================================
-- 9. ADMIN: REPORTS QUEUE + CONTENT ACTIONS
-- ==========================================
-- Open reports grouped by target, most-reported first. No reporter identities.
CREATE OR REPLACE FUNCTION public.admin_moderation_queue(p_actor_id UUID, p_limit INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_items JSONB;
    v_total INT;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    SELECT count(*) INTO v_total
    FROM (SELECT DISTINCT target_type, target_id FROM public.content_reports WHERE status = 'OPEN') t;

    WITH grp AS (
        SELECT r.target_type, r.target_id, count(*)::INT AS open_count,
               min(r.created_at) AS first_reported_at, max(r.created_at) AS last_reported_at
        FROM public.content_reports r
        WHERE r.status = 'OPEN'
        GROUP BY r.target_type, r.target_id
        ORDER BY count(*) DESC, max(r.created_at) DESC, r.target_type, r.target_id
        LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'target_type', g.target_type,
               'target_id', g.target_id,
               'open_count', g.open_count,
               'first_reported_at', g.first_reported_at,
               'last_reported_at', g.last_reported_at,
               'reason_counts', (
                   SELECT jsonb_object_agg(x.reason, x.n) FROM (
                       SELECT r.reason, count(*)::INT AS n FROM public.content_reports r
                       WHERE r.status = 'OPEN' AND r.target_type = g.target_type AND r.target_id = g.target_id
                       GROUP BY r.reason
                   ) x
               ),
               'latest', (
                   SELECT coalesce(jsonb_agg(jsonb_build_object('reason', y.reason, 'note', y.note, 'created_at', y.created_at)
                                             ORDER BY y.created_at DESC), '[]'::jsonb)
                   FROM (
                       SELECT r.reason, r.note, r.created_at FROM public.content_reports r
                       WHERE r.status = 'OPEN' AND r.target_type = g.target_type AND r.target_id = g.target_id
                       ORDER BY r.created_at DESC LIMIT 5
                   ) y
               ),
               'drop', CASE WHEN g.target_type = 'DROP' THEN (
                   SELECT jsonb_build_object(
                       'id', d.id, 'title', d.title, 'tagline', d.tagline, 'vibe_tag', d.vibe_tag,
                       'creator_id', d.creator_id, 'creator_handle', cp.handle, 'creator_name', cp.username,
                       'creator_badge', d.creator_badge, 'moderation_status', d.moderation_status,
                       'hidden_reason', d.hidden_reason, 'created_at', d.created_at)
                   FROM public.workout_drops d JOIN public.profiles cp ON cp.id = d.creator_id
                   WHERE d.id = g.target_id) END,
               'squad', CASE WHEN g.target_type = 'SQUAD' THEN (
                   SELECT jsonb_build_object(
                       'id', s.id, 'name', s.name, 'tag', s.tag, 'icon', s.avatar,
                       'member_count', (SELECT count(*) FROM public.profiles m WHERE m.squad_id = s.id),
                       'created_at', s.created_at)
                   FROM public.squads s WHERE s.id = g.target_id::uuid) END
           ) ORDER BY g.open_count DESC, g.last_reported_at DESC, g.target_type, g.target_id), '[]'::jsonb)
    INTO v_items
    FROM grp g;

    RETURN jsonb_build_object('status', 'ok', 'total_targets', v_total, 'items', v_items);
END;
$$;

-- Hides a drop from every public listing (reason shown to its creator). Resolves the drop's open
-- reports as ACTIONED. Statuses: hidden {resolved_reports} | already_hidden | not_found | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_hide_drop(p_actor_id UUID, p_drop_id TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_drop public.workout_drops%ROWTYPE;
    v_reason TEXT := btrim(coalesce(p_reason, ''));
    v_resolved INT;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO v_drop FROM public.workout_drops WHERE id = p_drop_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_drop.moderation_status = 'HIDDEN' THEN
        RETURN jsonb_build_object('status', 'already_hidden');
    END IF;
    UPDATE public.workout_drops
    SET moderation_status = 'HIDDEN', hidden_reason = v_reason, hidden_at = NOW(), hidden_by = p_actor_id
    WHERE id = p_drop_id;
    v_resolved := private.resolve_reports(p_actor_id, 'DROP', p_drop_id, 'ACTIONED');
    PERFORM private.write_admin_audit(p_actor_id, 'DROP_HIDDEN', 'DROP', p_drop_id, jsonb_build_object(
        'reason', v_reason, 'title', v_drop.title, 'creator_id', v_drop.creator_id, 'resolved_reports', v_resolved));
    RETURN jsonb_build_object('status', 'hidden', 'resolved_reports', v_resolved);
END;
$$;

-- Statuses: restored | not_hidden | not_found | forbidden.
CREATE OR REPLACE FUNCTION public.admin_restore_drop(p_actor_id UUID, p_drop_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_drop public.workout_drops%ROWTYPE;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    SELECT * INTO v_drop FROM public.workout_drops WHERE id = p_drop_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_drop.moderation_status <> 'HIDDEN' THEN
        RETURN jsonb_build_object('status', 'not_hidden');
    END IF;
    UPDATE public.workout_drops
    SET moderation_status = 'PUBLISHED', hidden_reason = NULL, hidden_at = NULL, hidden_by = NULL
    WHERE id = p_drop_id;
    PERFORM private.write_admin_audit(p_actor_id, 'DROP_RESTORED', 'DROP', p_drop_id, jsonb_build_object(
        'previous_reason', v_drop.hidden_reason, 'hidden_at', v_drop.hidden_at, 'title', v_drop.title));
    RETURN jsonb_build_object('status', 'restored');
END;
$$;

-- Dismisses every open report on a target. Statuses: dismissed {count} | no_open_reports | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_dismiss_reports(p_actor_id UUID, p_target_type TEXT, p_target_id TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF p_target_type NOT IN ('DROP', 'SQUAD') OR (v_note IS NOT NULL AND char_length(v_note) > 500) THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_count := private.resolve_reports(p_actor_id, p_target_type, p_target_id, 'DISMISSED');
    IF v_count = 0 THEN
        RETURN jsonb_build_object('status', 'no_open_reports');
    END IF;
    PERFORM private.write_admin_audit(p_actor_id, 'REPORTS_DISMISSED', p_target_type, p_target_id,
        jsonb_build_object('count', v_count, 'note', v_note));
    RETURN jsonb_build_object('status', 'dismissed', 'count', v_count);
END;
$$;

-- Renames a squad to the neutral "Squad <TAG>" (suffixed if a squad already has that name) and
-- regenerates its invite code (old links stop working). Resolves its open reports as ACTIONED.
-- Statuses: reset {name, previous_name, resolved_reports} | not_found | forbidden.
CREATE OR REPLACE FUNCTION public.admin_reset_squad_name(p_actor_id UUID, p_squad_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad public.squads%ROWTYPE;
    v_name TEXT;
    v_try INT := 0;
    v_resolved INT;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    SELECT * INTO v_squad FROM public.squads WHERE id = p_squad_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    LOOP
        v_name := 'Squad ' || v_squad.tag || CASE WHEN v_try = 0 THEN '' ELSE ' ' || (v_try + 1)::TEXT END;
        BEGIN
            UPDATE public.squads SET name = v_name, invite_code = private.new_squad_invite_code() WHERE id = p_squad_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_try := v_try + 1;
            IF v_try >= 10 THEN
                RAISE;
            END IF;
        END;
    END LOOP;
    v_resolved := private.resolve_reports(p_actor_id, 'SQUAD', p_squad_id::TEXT, 'ACTIONED');
    PERFORM private.write_admin_audit(p_actor_id, 'SQUAD_NAME_RESET', 'SQUAD', p_squad_id::TEXT, jsonb_build_object(
        'previous_name', v_squad.name, 'name', v_name, 'tag', v_squad.tag, 'invite_code_regenerated', true,
        'resolved_reports', v_resolved));
    RETURN jsonb_build_object('status', 'reset', 'name', v_name, 'previous_name', v_squad.name, 'resolved_reports', v_resolved);
END;
$$;

-- Sets a drop's creator badge (1-50 chars) or, with NULL, resets it to 'Verified Creator'. Only for
-- drops whose creator is a verified creator (role CREATOR or ADMIN).
-- Statuses: updated {badge} | not_found | not_verified_creator | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_set_creator_badge(p_actor_id UUID, p_drop_id TEXT, p_badge TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_drop public.workout_drops%ROWTYPE;
    v_role public.user_role_enum;
    v_badge TEXT := coalesce(nullif(btrim(regexp_replace(coalesce(p_badge, ''), '\s+', ' ', 'g')), ''), 'Verified Creator');
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF char_length(v_badge) > 50 THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO v_drop FROM public.workout_drops WHERE id = p_drop_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = v_drop.creator_id;
    IF v_role IS NULL OR v_role NOT IN ('CREATOR', 'ADMIN') THEN
        RETURN jsonb_build_object('status', 'not_verified_creator');
    END IF;
    IF v_drop.creator_badge IS DISTINCT FROM v_badge THEN
        UPDATE public.workout_drops SET creator_badge = v_badge WHERE id = p_drop_id;
        PERFORM private.write_admin_audit(p_actor_id, 'CREATOR_BADGE_SET', 'DROP', p_drop_id,
            jsonb_build_object('from', v_drop.creator_badge, 'to', v_badge));
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'badge', v_badge);
END;
$$;

-- ==========================================
-- 10. ADMIN: USERS + ROLES
-- ==========================================
-- Replaces the init version (same signature) with guardrails and auditing. All ADMIN rows are
-- locked (id order) before the actor is re-checked, so two admins demoting each other serialise
-- and the second one is no longer an admin. Statuses: updated {profile} | unchanged | forbidden |
-- not_found | cannot_change_self | last_admin | system_profile.
CREATE OR REPLACE FUNCTION public.admin_set_role(
    p_actor_id UUID,
    p_target_id UUID,
    p_role public.user_role_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_target public.profiles%ROWTYPE;
    v_before public.user_role_enum;
BEGIN
    PERFORM 1 FROM public.profiles WHERE role = 'ADMIN' ORDER BY id FOR UPDATE;
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF p_actor_id = p_target_id THEN
        RETURN jsonb_build_object('status', 'cannot_change_self');
    END IF;
    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_target.auth_id IS NULL THEN
        RETURN jsonb_build_object('status', 'system_profile');
    END IF;
    v_before := v_target.role;
    IF v_before = p_role THEN
        RETURN jsonb_build_object('status', 'unchanged', 'profile', to_jsonb(v_target) - 'auth_id');
    END IF;
    IF v_before = 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.role = 'ADMIN' AND p.id <> p_target_id AND p.auth_id IS NOT NULL
    ) THEN
        RETURN jsonb_build_object('status', 'last_admin');
    END IF;
    UPDATE public.profiles SET role = p_role WHERE id = p_target_id RETURNING * INTO v_target;
    PERFORM private.write_admin_audit(p_actor_id, 'ROLE_CHANGED', 'USER', p_target_id::TEXT,
        jsonb_build_object('from', v_before, 'to', p_role, 'handle', v_target.handle));
    RETURN jsonb_build_object('status', 'updated', 'profile', to_jsonb(v_target) - 'auth_id');
END;
$$;

-- Admin user search by handle / display name (case-insensitive substring), handle order, keyset
-- pagination (p_after_handle = last handle of the previous page).
CREATE OR REPLACE FUNCTION public.admin_search_users(
    p_actor_id UUID,
    p_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_after_handle TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_q TEXT := nullif(btrim(coalesce(p_query, '')), '');
    v_pattern TEXT;
    v_limit INT := least(greatest(coalesce(p_limit, 20), 1), 50);
    v_items JSONB;
    v_count INT;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF v_q IS NOT NULL THEN
        v_pattern := '%' || replace(replace(replace(left(v_q, 50), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    END IF;

    WITH page AS (
        SELECT p.* FROM public.profiles p
        WHERE (v_pattern IS NULL OR p.handle ILIKE v_pattern OR p.username ILIKE v_pattern)
          AND (p_after_handle IS NULL OR p.handle > p_after_handle)
        ORDER BY p.handle
        LIMIT v_limit + 1
    )
    SELECT count(*)::INT,
           coalesce(jsonb_agg(jsonb_build_object(
               'id', pg.id, 'handle', pg.handle, 'username', pg.username, 'avatar_url', pg.avatar_url,
               'role', pg.role, 'rank', pg.rank, 'aura_points', pg.aura_points, 'created_at', pg.created_at,
               'suspended', pg.suspended_at IS NOT NULL, 'is_system', pg.auth_id IS NULL
           ) ORDER BY pg.handle) FILTER (WHERE pg.rn <= v_limit), '[]'::jsonb)
    INTO v_count, v_items
    FROM (SELECT page.*, row_number() OVER (ORDER BY page.handle) AS rn FROM page) pg;

    RETURN jsonb_build_object(
        'status', 'ok',
        'items', v_items,
        'next_after', CASE WHEN v_count > v_limit THEN v_items -> (v_limit - 1) ->> 'handle' END
    );
END;
$$;

-- Profile summary for the admin user view: profile, suspension, counts, last 20 completions (with
-- ledger ids for "Revert"), and the latest audit entries about the user.
CREATE OR REPLACE FUNCTION public.admin_user_summary(p_actor_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_p public.profiles%ROWTYPE;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    SELECT * INTO v_p FROM public.profiles WHERE id = p_target_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object(
        'status', 'ok',
        'profile', jsonb_build_object(
            'id', v_p.id, 'handle', v_p.handle, 'username', v_p.username, 'avatar_url', v_p.avatar_url,
            'role', v_p.role, 'rank', v_p.rank, 'aura_points', v_p.aura_points,
            'weekly_aura_gained', v_p.weekly_aura_gained, 'streak_days', v_p.streak_days,
            'total_workouts', v_p.total_workouts, 'created_at', v_p.created_at, 'is_system', v_p.auth_id IS NULL,
            'suspended', v_p.suspended_at IS NOT NULL, 'suspended_at', v_p.suspended_at,
            'suspension_reason', v_p.suspension_reason, 'flags_cleared_at', v_p.aura_flags_cleared_at,
            'attributes', jsonb_build_object('str', v_p.str_stat, 'agi', v_p.agi_stat, 'end', v_p.end_stat, 'rec', v_p.rec_stat)
        ),
        'counts', jsonb_build_object(
            'quest_logs', (SELECT count(*) FROM public.user_quest_logs q WHERE q.user_id = v_p.id),
            'workout_logs', (SELECT count(*) FROM public.user_workout_logs w WHERE w.user_id = v_p.id),
            'drops', (SELECT count(*) FROM public.workout_drops d WHERE d.creator_id = v_p.id),
            'hidden_drops', (SELECT count(*) FROM public.workout_drops d WHERE d.creator_id = v_p.id AND d.moderation_status = 'HIDDEN'),
            'open_reports_on_drops', (
                SELECT count(*) FROM public.content_reports r
                JOIN public.workout_drops d ON d.id = r.target_id AND r.target_type = 'DROP'
                WHERE r.status = 'OPEN' AND d.creator_id = v_p.id)
        ),
        'recent_logs', coalesce((
            SELECT jsonb_agg(to_jsonb(l) ORDER BY l.completed_at DESC, l.id) FROM (
                SELECT 'QUEST' AS kind, q.id, q.quest_id AS item_id, qs.title, q.aura_earned, q.completed_at, q.date_key
                FROM public.user_quest_logs q JOIN public.quests qs ON qs.id = q.quest_id WHERE q.user_id = v_p.id
                UNION ALL
                SELECT 'WORKOUT', w.id, w.drop_id, coalesce(d.title, 'Deleted workout'), w.aura_earned, w.completed_at, w.date_key
                FROM public.user_workout_logs w LEFT JOIN public.workout_drops d ON d.id = w.drop_id WHERE w.user_id = v_p.id
                ORDER BY completed_at DESC, id
                LIMIT 20
            ) l
        ), '[]'::jsonb),
        'audit', coalesce((
            SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC, a.id DESC) FROM (
                SELECT a.id, a.actor_id, a.actor_handle, a.action, a.target_type, a.target_id, a.details, a.created_at
                FROM public.admin_audit_log a
                WHERE a.target_type = 'USER' AND a.target_id = v_p.id::TEXT
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT 10
            ) a
        ), '[]'::jsonb)
    );
END;
$$;

-- Statuses: suspended | already_suspended | not_found | cannot_suspend_self | cannot_suspend_admin |
-- system_profile | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_actor_id UUID, p_target_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_target public.profiles%ROWTYPE;
    v_reason TEXT := btrim(coalesce(p_reason, ''));
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF p_actor_id = p_target_id THEN
        RETURN jsonb_build_object('status', 'cannot_suspend_self');
    END IF;
    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_target.auth_id IS NULL THEN
        RETURN jsonb_build_object('status', 'system_profile');
    END IF;
    IF v_target.role = 'ADMIN' THEN
        RETURN jsonb_build_object('status', 'cannot_suspend_admin');
    END IF;
    IF v_target.suspended_at IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_suspended');
    END IF;
    UPDATE public.profiles SET suspended_at = NOW(), suspension_reason = v_reason, suspended_by = p_actor_id
    WHERE id = p_target_id;
    PERFORM private.write_admin_audit(p_actor_id, 'USER_SUSPENDED', 'USER', p_target_id::TEXT,
        jsonb_build_object('reason', v_reason, 'handle', v_target.handle));
    RETURN jsonb_build_object('status', 'suspended');
END;
$$;

-- Statuses: unsuspended | not_suspended | not_found | forbidden.
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_actor_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_target public.profiles%ROWTYPE;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    IF v_target.suspended_at IS NULL THEN
        RETURN jsonb_build_object('status', 'not_suspended');
    END IF;
    UPDATE public.profiles SET suspended_at = NULL, suspension_reason = NULL, suspended_by = NULL WHERE id = p_target_id;
    PERFORM private.write_admin_audit(p_actor_id, 'USER_UNSUSPENDED', 'USER', p_target_id::TEXT, jsonb_build_object(
        'previous_reason', v_target.suspension_reason, 'suspended_at', v_target.suspended_at, 'handle', v_target.handle));
    RETURN jsonb_build_object('status', 'unsuspended');
END;
$$;

-- ==========================================
-- 11. ADMIN: SUSPICIOUS AURA FLAGS
-- ==========================================
-- Users whose recent completions look automated or impossible. Only activity in
-- (now - p_lookback_days, now] and after profiles.aura_flags_cleared_at counts. A user is flagged when:
--   burst: more than p_burst_per_hour quest+workout completions within any 60-minute window;
--   day:   aura earned today (UTC) >= p_day_aura_min AND (no baseline, or >= p_day_aura_multiplier x
--          the user's average daily aura over the previous 14 UTC days with activity; a baseline
--          needs >= 3 active days);
--   fast:  >= p_fast_min_count workouts completed less than duration_minutes x p_fast_ratio after
--          the user's previous completion.
-- Thresholds come from AURA_FLAG_DEFAULTS (packages/shared/src/moderation.ts) via the API.
CREATE OR REPLACE FUNCTION public.admin_flagged_users(
    p_actor_id UUID,
    p_now TIMESTAMPTZ DEFAULT NOW(),
    p_burst_per_hour INT DEFAULT 6,
    p_day_aura_min INT DEFAULT 4000,
    p_day_aura_multiplier NUMERIC DEFAULT 4,
    p_fast_ratio NUMERIC DEFAULT 0.5,
    p_fast_min_count INT DEFAULT 3,
    p_lookback_days INT DEFAULT 7,
    p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := coalesce(p_now, NOW());
    v_since TIMESTAMPTZ := v_now - make_interval(days => least(greatest(coalesce(p_lookback_days, 7), 1), 30));
    v_today_start TIMESTAMPTZ := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_items JSONB;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;

    WITH ledger AS (
        SELECT 'QUEST'::TEXT AS kind, q.id AS log_id, q.user_id, q.quest_id::TEXT AS item_id, qs.title::TEXT AS title,
               q.aura_earned, q.completed_at, NULL::INT AS duration_minutes
        FROM public.user_quest_logs q
        JOIN public.quests qs ON qs.id = q.quest_id
        JOIN public.profiles p ON p.id = q.user_id
        WHERE q.completed_at > v_since AND q.completed_at <= v_now
          AND (p.aura_flags_cleared_at IS NULL OR q.completed_at > p.aura_flags_cleared_at)
        UNION ALL
        SELECT 'WORKOUT', w.id, w.user_id, w.drop_id::TEXT, coalesce(d.title::TEXT, 'Deleted workout'), w.aura_earned, w.completed_at, d.duration_minutes
        FROM public.user_workout_logs w
        LEFT JOIN public.workout_drops d ON d.id = w.drop_id
        JOIN public.profiles p ON p.id = w.user_id
        WHERE w.completed_at > v_since AND w.completed_at <= v_now
          AND (p.aura_flags_cleared_at IS NULL OR w.completed_at > p.aura_flags_cleared_at)
    ),
    seq AS (
        SELECT l.*,
               count(*) OVER (PARTITION BY l.user_id ORDER BY l.completed_at
                              RANGE BETWEEN CURRENT ROW AND INTERVAL '59 minutes 59.999999 seconds' FOLLOWING) AS in_hour,
               lag(l.completed_at) OVER (PARTITION BY l.user_id ORDER BY l.completed_at, l.log_id) AS prev_at
        FROM ledger l
    ),
    marked AS (
        SELECT s.*,
               coalesce(s.kind = 'WORKOUT' AND s.prev_at IS NOT NULL AND s.duration_minutes IS NOT NULL
                AND s.completed_at - s.prev_at < make_interval(secs => s.duration_minutes * 60 * coalesce(p_fast_ratio, 0.5)), false) AS too_fast
        FROM seq s
    ),
    per_user AS (
        SELECT m.user_id,
               count(*)::INT AS completions,
               max(m.in_hour)::INT AS max_per_hour,
               (array_agg(m.completed_at ORDER BY m.in_hour DESC, m.completed_at))[1] AS burst_start,
               coalesce(sum(m.aura_earned) FILTER (WHERE m.completed_at >= v_today_start), 0)::INT AS today_aura,
               count(*) FILTER (WHERE m.too_fast)::INT AS fast_count
        FROM marked m
        GROUP BY m.user_id
    ),
    baseline AS (
        SELECT b.user_id, count(*)::INT AS active_days, round(avg(b.day_aura))::INT AS typical_daily_aura
        FROM (
            SELECT x.user_id, (x.completed_at AT TIME ZONE 'UTC')::date AS day, sum(x.aura_earned) AS day_aura
            FROM (
                SELECT q.user_id, q.completed_at, q.aura_earned FROM public.user_quest_logs q
                WHERE q.completed_at >= v_today_start - INTERVAL '14 days' AND q.completed_at < v_today_start
                UNION ALL
                SELECT w.user_id, w.completed_at, w.aura_earned FROM public.user_workout_logs w
                WHERE w.completed_at >= v_today_start - INTERVAL '14 days' AND w.completed_at < v_today_start
            ) x
            WHERE x.user_id IN (SELECT pu.user_id FROM per_user pu)
            GROUP BY x.user_id, (x.completed_at AT TIME ZONE 'UTC')::date
        ) b
        GROUP BY b.user_id
    ),
    flagged AS (
        SELECT pu.*,
               CASE WHEN bl.active_days >= 3 THEN bl.typical_daily_aura END AS typical_daily_aura,
               coalesce(bl.active_days, 0) AS baseline_days,
               (pu.max_per_hour > p_burst_per_hour) AS burst,
               (pu.today_aura >= p_day_aura_min
                AND (bl.active_days IS NULL OR bl.active_days < 3
                     OR pu.today_aura >= bl.typical_daily_aura * p_day_aura_multiplier)) AS day_spike,
               (pu.fast_count >= p_fast_min_count) AS fast
        FROM per_user pu
        LEFT JOIN baseline bl ON bl.user_id = pu.user_id
    ),
    hits AS (
        SELECT f.* FROM flagged f WHERE f.burst OR f.day_spike OR f.fast
        ORDER BY (f.burst::INT + f.day_spike::INT + f.fast::INT) DESC, f.today_aura DESC, f.user_id
        LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'profile_id', h.user_id,
               'handle', p.handle,
               'username', p.username,
               'role', p.role,
               'aura_points', p.aura_points,
               'suspended', p.suspended_at IS NOT NULL,
               'flags_cleared_at', p.aura_flags_cleared_at,
               'flags', to_jsonb(array_remove(ARRAY[
                   CASE WHEN h.burst THEN 'BURST' END,
                   CASE WHEN h.day_spike THEN 'DAY_SPIKE' END,
                   CASE WHEN h.fast THEN 'TOO_FAST' END], NULL)),
               'metrics', jsonb_build_object(
                   'completions', h.completions,
                   'max_per_hour', h.max_per_hour,
                   'burst_window_start', h.burst_start,
                   'today_aura', h.today_aura,
                   'typical_daily_aura', h.typical_daily_aura,
                   'baseline_days', h.baseline_days,
                   'fast_count', h.fast_count),
               'evidence', coalesce((
                   SELECT jsonb_agg(jsonb_build_object(
                              'kind', e.kind, 'log_id', e.log_id, 'item_id', e.item_id, 'title', e.title,
                              'aura_earned', e.aura_earned, 'completed_at', e.completed_at,
                              'duration_minutes', e.duration_minutes,
                              'seconds_since_previous', CASE WHEN e.prev_at IS NULL THEN NULL
                                                             ELSE floor(extract(epoch FROM e.completed_at - e.prev_at))::INT END,
                              'too_fast', e.too_fast)
                          ORDER BY e.completed_at DESC, e.log_id)
                   FROM (SELECT * FROM marked m WHERE m.user_id = h.user_id ORDER BY m.completed_at DESC, m.log_id LIMIT 25) e
               ), '[]'::jsonb)
           ) ORDER BY (h.burst::INT + h.day_spike::INT + h.fast::INT) DESC, h.today_aura DESC, h.user_id), '[]'::jsonb)
    INTO v_items
    FROM hits h
    JOIN public.profiles p ON p.id = h.user_id;

    RETURN jsonb_build_object('status', 'ok', 'generated_at', v_now, 'since', v_since, 'items', v_items);
END;
$$;

-- "Clear flag": ignore everything up to now for this user. Statuses: cleared | not_found | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_clear_flag(p_actor_id UUID, p_target_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_target public.profiles%ROWTYPE;
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    UPDATE public.profiles SET aura_flags_cleared_at = NOW() WHERE id = p_target_id;
    PERFORM private.write_admin_audit(p_actor_id, 'FLAG_CLEARED', 'USER', p_target_id::TEXT, jsonb_build_object(
        'note', v_note, 'previous_cleared_at', v_target.aura_flags_cleared_at, 'handle', v_target.handle));
    RETURN jsonb_build_object('status', 'cleared');
END;
$$;

-- Reverts ONE completion (see the header for what is and is not reverted).
-- p_kind: 'QUEST' | 'WORKOUT'. Lock order: profile, then the ledger row (same as the game actions).
-- Statuses: reverted {aura_removed, profile} | not_found | invalid | forbidden.
CREATE OR REPLACE FUNCTION public.admin_revert_log(
    p_actor_id UUID,
    p_target_id UUID,
    p_kind TEXT,
    p_log_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
    v_profile public.profiles%ROWTYPE;
    v_after public.profiles%ROWTYPE;
    v_item TEXT;
    v_aura INT;
    v_completed TIMESTAMPTZ;
    v_date DATE;
    v_stat TEXT;
    v_amount INT;
    v_in_week BOOLEAN;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    IF p_kind NOT IN ('QUEST', 'WORKOUT') OR (v_note IS NOT NULL AND char_length(v_note) > 500) THEN
        RETURN jsonb_build_object('status', 'invalid');
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;

    IF p_kind = 'QUEST' THEN
        DELETE FROM public.user_quest_logs l
        WHERE l.id = p_log_id AND l.user_id = p_target_id
        RETURNING l.quest_id, l.aura_earned, l.completed_at, l.date_key INTO v_item, v_aura, v_completed, v_date;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'not_found');
        END IF;
        SELECT q.stat_reward_stat, q.stat_reward_amount INTO v_stat, v_amount FROM public.quests q WHERE q.id = v_item;
    ELSE
        DELETE FROM public.user_workout_logs l
        WHERE l.id = p_log_id AND l.user_id = p_target_id
        RETURNING l.drop_id, l.aura_earned, l.completed_at, l.date_key INTO v_item, v_aura, v_completed, v_date;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'not_found');
        END IF;
        -- The drop may have been deleted since (drop_id is then NULL): nothing to decrement.
        UPDATE public.workout_drops SET completions_count = greatest(0, completions_count - 1) WHERE id = v_item;
    END IF;

    v_in_week := v_completed >= private.squad_week_start(NOW());

    UPDATE public.profiles AS p SET
        aura_points = greatest(0, p.aura_points - v_aura),
        weekly_aura_gained = CASE WHEN v_in_week THEN greatest(0, p.weekly_aura_gained - v_aura) ELSE p.weekly_aura_gained END,
        total_workouts = greatest(0, p.total_workouts - 1),
        str_stat = greatest(0, p.str_stat - CASE WHEN p_kind = 'WORKOUT' THEN 4 WHEN v_stat = 'str' THEN coalesce(v_amount, 0) ELSE 0 END),
        agi_stat = greatest(0, p.agi_stat - CASE WHEN p_kind = 'WORKOUT' THEN 4 WHEN v_stat = 'agi' THEN coalesce(v_amount, 0) ELSE 0 END),
        end_stat = greatest(0, p.end_stat - CASE WHEN p_kind = 'WORKOUT' THEN 3 WHEN v_stat = 'end' THEN coalesce(v_amount, 0) ELSE 0 END),
        rec_stat = greatest(0, p.rec_stat - CASE WHEN p_kind = 'QUEST' AND v_stat = 'rec' THEN coalesce(v_amount, 0) ELSE 0 END)
    WHERE p.id = p_target_id
    RETURNING * INTO v_after;

    PERFORM private.write_admin_audit(p_actor_id, 'AURA_REVERTED',
        CASE WHEN p_kind = 'QUEST' THEN 'QUEST_LOG' ELSE 'WORKOUT_LOG' END, p_log_id::TEXT,
        jsonb_build_object(
            'user_id', p_target_id, 'handle', v_profile.handle, 'kind', p_kind, 'item_id', v_item,
            'aura_earned', v_aura, 'completed_at', v_completed, 'date_key', v_date, 'note', v_note,
            'weekly_adjusted', v_in_week,
            'before', jsonb_build_object('aura_points', v_profile.aura_points, 'weekly_aura_gained', v_profile.weekly_aura_gained,
                'total_workouts', v_profile.total_workouts, 'str', v_profile.str_stat, 'agi', v_profile.agi_stat,
                'end', v_profile.end_stat, 'rec', v_profile.rec_stat),
            'after', jsonb_build_object('aura_points', v_after.aura_points, 'weekly_aura_gained', v_after.weekly_aura_gained,
                'total_workouts', v_after.total_workouts, 'str', v_after.str_stat, 'agi', v_after.agi_stat,
                'end', v_after.end_stat, 'rec', v_after.rec_stat)));

    RETURN jsonb_build_object('status', 'reverted', 'aura_removed', v_profile.aura_points - v_after.aura_points,
                              'profile', to_jsonb(v_after) - 'auth_id');
END;
$$;

-- ==========================================
-- 12. ADMIN: AUDIT LOG READ
-- ==========================================
-- Newest first; keyset pagination with (p_before_created_at, p_before_id) of the last row seen.
CREATE OR REPLACE FUNCTION public.admin_audit_entries(
    p_actor_id UUID,
    p_action TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_target_id TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_before_created_at TIMESTAMPTZ DEFAULT NULL,
    p_before_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_limit INT := least(greatest(coalesce(p_limit, 50), 1), 100);
    v_items JSONB;
    v_count INT;
BEGIN
    IF NOT private.is_active_admin(p_actor_id) THEN
        RETURN jsonb_build_object('status', 'forbidden');
    END IF;
    WITH page AS (
        SELECT a.* FROM public.admin_audit_log a
        WHERE (p_action IS NULL OR a.action = p_action)
          AND (p_target_type IS NULL OR a.target_type = p_target_type)
          AND (p_target_id IS NULL OR a.target_id = p_target_id)
          AND (p_before_created_at IS NULL OR (a.created_at, a.id) < (p_before_created_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT v_limit + 1
    ),
    numbered AS (
        SELECT page.*, row_number() OVER (ORDER BY page.created_at DESC, page.id DESC) AS rn FROM page
    )
    SELECT count(*)::INT,
           coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'actor_id', n.actor_id, 'actor_handle', n.actor_handle, 'action', n.action,
               'target_type', n.target_type, 'target_id', n.target_id, 'details', n.details, 'created_at', n.created_at
           ) ORDER BY n.created_at DESC, n.id DESC) FILTER (WHERE n.rn <= v_limit), '[]'::jsonb)
    INTO v_count, v_items
    FROM numbered n;

    RETURN jsonb_build_object(
        'status', 'ok',
        'items', v_items,
        'next_before', CASE WHEN v_count > v_limit THEN jsonb_build_object(
            'created_at', v_items -> (v_limit - 1) -> 'created_at', 'id', v_items -> (v_limit - 1) -> 'id') END
    );
END;
$$;

-- ==========================================
-- 13. FUNCTION PRIVILEGES (service_role only)
-- ==========================================
REVOKE ALL ON FUNCTION public.submit_report(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_account_moderation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_moderation_queue(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_hide_drop(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_drop(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dismiss_reports(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_squad_name(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_creator_badge(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_role(UUID, UUID, public.user_role_enum) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_search_users(UUID, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_user_summary(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_suspend_user(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_unsuspend_user(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_flagged_users(UUID, TIMESTAMPTZ, INT, INT, NUMERIC, NUMERIC, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_clear_flag(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revert_log(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_audit_entries(UUID, TEXT, TEXT, TEXT, INT, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_report(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_account_moderation(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_moderation_queue(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_hide_drop(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_restore_drop(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dismiss_reports(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_squad_name(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_badge(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_role(UUID, UUID, public.user_role_enum) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_users(UUID, TEXT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_summary(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_flagged_users(UUID, TIMESTAMPTZ, INT, INT, NUMERIC, NUMERIC, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_clear_flag(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revert_log(UUID, UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_audit_entries(UUID, TEXT, TEXT, TEXT, INT, TIMESTAMPTZ, UUID) TO service_role;
