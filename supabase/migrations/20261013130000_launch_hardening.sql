-- AuraFit launch hardening (applies on top of 20261013120000_aurafit_init.sql).
--
--   1. private.current_profile_id(): SECURITY DEFINER lookup of the caller's profile id,
--      so RLS policies no longer read profiles.auth_id as the querying role.
--   2. profiles: one merged UPDATE policy (fixes advisor `multiple_permissive_policies`).
--   3. Ledger + workout_drops policies rewritten on top of the private helpers.
--   4. profiles.auth_id is no longer readable through the Data API (column-level SELECT).
--   5. Weekly aura reset: private.reset_weekly_aura() + a pg_cron job (Mondays 00:00 UTC).
--
-- Idempotent: safe to re-run. Do not edit after it has been applied; add a new
-- migration instead (then run `npm run db:sync` to regenerate packages/shared/schema.sql).
--
-- Account deletion (DELETE /api/v1/me) needs no schema change: auth.users -> profiles
-- (auth_id ON DELETE CASCADE) -> user_quest_logs / user_workout_logs / workout_drops
-- (ON DELETE CASCADE), and squads.leader_id / profiles.squad_id are ON DELETE SET NULL.

-- ==========================================
-- 1. PRIVATE HELPER: caller's profile id
-- ==========================================
-- SECURITY DEFINER so policies can resolve auth.uid() -> profiles.id without the
-- caller holding SELECT on profiles.auth_id (revoked in section 4). Scoped to
-- auth.uid(); lives in the non-exposed `private` schema (not a Data API RPC).
CREATE OR REPLACE FUNCTION private.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT id FROM public.profiles WHERE auth_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION private.current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_profile_id() TO authenticated, service_role;

-- ==========================================
-- 2. PROFILES: single UPDATE policy
-- ==========================================
-- Same semantics as the two permissive policies it replaces (OR of both):
-- a user may update their own row; an ADMIN may update any row. Column grants
-- still limit what can change (username, avatar_url, title, bio).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile; admins any" ON public.profiles;
CREATE POLICY "Users update own profile; admins any" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        (SELECT auth.uid()) = auth_id
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    )
    WITH CHECK (
        (SELECT auth.uid()) = auth_id
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

-- ==========================================
-- 3. POLICIES THAT SUB-SELECTED profiles.auth_id
-- ==========================================
-- Sub-queries inside a policy run with the caller's privileges, so they would fail
-- once authenticated lacks SELECT on profiles.auth_id. Use the private helpers.
DROP POLICY IF EXISTS "Users can read their own quest logs" ON public.user_quest_logs;
CREATE POLICY "Users can read their own quest logs" ON public.user_quest_logs
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT private.current_profile_id())
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

DROP POLICY IF EXISTS "Users can read their own workout logs" ON public.user_workout_logs;
CREATE POLICY "Users can read their own workout logs" ON public.user_workout_logs
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT private.current_profile_id())
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

DROP POLICY IF EXISTS "Creators can publish workout drops" ON public.workout_drops;
CREATE POLICY "Creators can publish workout drops" ON public.workout_drops
    FOR INSERT TO authenticated
    WITH CHECK (
        creator_id = (SELECT private.current_profile_id())
        AND (SELECT private.current_profile_role()) IN ('CREATOR', 'ADMIN')
    );

DROP POLICY IF EXISTS "Creators can update their own workout drops" ON public.workout_drops;
CREATE POLICY "Creators can update their own workout drops" ON public.workout_drops
    FOR UPDATE TO authenticated
    USING (
        creator_id = (SELECT private.current_profile_id())
        AND (SELECT private.current_profile_role()) IN ('CREATOR', 'ADMIN')
    )
    WITH CHECK (
        creator_id = (SELECT private.current_profile_id())
        AND (SELECT private.current_profile_role()) IN ('CREATOR', 'ADMIN')
    );

DROP POLICY IF EXISTS "Creators can delete their own workout drops; admins any" ON public.workout_drops;
CREATE POLICY "Creators can delete their own workout drops; admins any" ON public.workout_drops
    FOR DELETE TO authenticated
    USING (
        creator_id = (SELECT private.current_profile_id())
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

-- ==========================================
-- 4. HIDE profiles.auth_id FROM THE DATA API
-- ==========================================
-- Table-level SELECT exposes every column (including future ones). Replace it with
-- column-level SELECT on everything except auth_id. Consequence for Data API clients:
-- `select=*` on profiles is denied for anon/authenticated; name the columns. The app
-- reads profiles server-side with the secret key and never needs auth_id client-side.
-- When adding a profiles column that clients may read, GRANT SELECT (col) explicitly.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
    id, username, handle, role, avatar_url, title, bio, aura_points, rank, level,
    str_stat, agi_stat, end_stat, rec_stat, streak_days, streak_shields, last_active_date,
    squad_id, gym_id, total_workouts, weekly_aura_gained, created_at, updated_at
) ON public.profiles TO anon, authenticated;

-- ==========================================
-- 5. WEEKLY AURA RESET
-- ==========================================
-- Zeroes profiles.weekly_aura_gained. Returns the number of rows changed.
-- SECURITY INVOKER: run by the pg_cron job owner (postgres) or service_role.
CREATE OR REPLACE FUNCTION private.reset_weekly_aura()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.profiles SET weekly_aura_gained = 0 WHERE weekly_aura_gained <> 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.reset_weekly_aura() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reset_weekly_aura() TO service_role;

-- pg_cron (Supabase Cron). Guarded so the migration also runs where the extension
-- is unavailable (local PGlite tests); there the job is simply not scheduled.
-- Supabase installs pg_cron into pg_catalog (https://supabase.com/docs/guides/cron/install).
-- pg_cron schedules are evaluated in GMT/UTC. cron.schedule() with an existing job
-- name overwrites that job, so re-running is safe.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
        GRANT USAGE ON SCHEMA cron TO postgres;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
        PERFORM cron.schedule(
            'aurafit-weekly-aura-reset',
            '0 0 * * 1', -- every Monday 00:00 UTC
            'SELECT private.reset_weekly_aura()'
        );
    ELSE
        RAISE NOTICE 'pg_cron is not available; weekly aura reset job not scheduled';
    END IF;
END $$;
