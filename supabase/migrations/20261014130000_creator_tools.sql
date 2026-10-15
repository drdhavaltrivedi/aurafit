-- AuraFit creator tools (applies on top of 20261014120000_squads.sql).
--
--   1. workout_drops.publish_at (timestamptz, NULL = live immediately). A drop is LIVE when
--      publish_at IS NULL OR publish_at <= now(); otherwise SCHEDULED. The API validates
--      "future only, at most 60 days ahead" (packages/shared/src/creator.ts); a trigger enforces
--      the 60-day horizon here too (with 1 day of slack for clock skew).
--   2. Scheduled drops are invisible to everyone but their creator (and admins) through the Data API:
--      RESTRICTIVE select policies, ANDed with whatever permissive policies exist (including any
--      moderation/status policy added by a later migration). The Next.js server (service_role) applies
--      the same rule in its queries (lib/data/supabase-repository.ts).
--   3. user_workout_logs.drop_id: ON DELETE CASCADE -> ON DELETE SET NULL (column now nullable).
--      Deleting a drop (creators can now do that from the studio) no longer erases athletes'
--      completion history, so squad weekly aura (computed from the ledgers) is unaffected.
--   4. public.creator_follows (follower, creator, created_at): PK (follower_id, creator_id) = unique
--      pair, CHECK no self-follow, trigger: the followed profile must be a CREATOR or ADMIN.
--      Server-only table (RLS on, no client privileges), like the push tables. Follower counts are
--      COMPUTED (count(*) on the (creator_id) index), not trigger-maintained: no hot counter row on
--      popular creators, nothing to drift, no extra profiles column to grant/hide.
--   5. Server-only functions (SECURITY INVOKER, EXECUTE to service_role only; same model as
--      public.complete_quest): follow_creator, unfollow_creator, creator_analytics.
--      creator_analytics returns aggregates only (counts / sums / per-day series). It never returns
--      athlete ids or handles, excludes the creator's own completions, and reports the last completion
--      per drop as a UTC date (not a timestamp).
--   6. Index: user_workout_logs (drop_id, completed_at) for the analytics window (it also covers the
--      drop_id FK, so the single-column index from the init migration is dropped).
--
-- Idempotent: safe to re-run (the PGlite tests apply every migration twice). Do not edit after it has
-- been applied; add a new migration instead (then run `npm run db:sync`).

-- ==========================================
-- 1. SCHEDULED PUBLISHING
-- ==========================================
ALTER TABLE public.workout_drops ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;
COMMENT ON COLUMN public.workout_drops.publish_at IS
    'Scheduled publish time. NULL = live immediately. Live when publish_at IS NULL OR publish_at <= now(). Max 60 days ahead.';

-- Partial index: only scheduled rows are interesting (live rows are the NULL majority).
CREATE INDEX IF NOT EXISTS idx_workout_drops_publish_at ON public.workout_drops (publish_at) WHERE publish_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.check_drop_publish_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    -- 60 days (CREATOR_DROP_LIMITS.publishMaxDays) + 1 day of slack for client/server clock skew.
    IF NEW.publish_at IS NOT NULL AND NEW.publish_at > NOW() + INTERVAL '61 days' THEN
        RAISE EXCEPTION 'publish_at must be at most 60 days ahead' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.check_drop_publish_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_workout_drops_publish_at ON public.workout_drops;
CREATE TRIGGER trg_workout_drops_publish_at BEFORE INSERT OR UPDATE OF publish_at ON public.workout_drops
    FOR EACH ROW EXECUTE FUNCTION private.check_drop_publish_at();

-- Clients writing through the Data API cannot schedule (the column is not in their INSERT/UPDATE
-- grants from the init migration); scheduling goes through /api/v1/creator/** only.
REVOKE INSERT (publish_at), UPDATE (publish_at) ON public.workout_drops FROM anon, authenticated;

-- ==========================================
-- 2. SCHEDULED DROPS ARE PRIVATE UNTIL LIVE
-- ==========================================
-- RESTRICTIVE: ANDed with the permissive "Workout drops readable by everyone" policy (and any
-- status/moderation policy a later migration adds), so neither can widen the other.
-- Separate anon/authenticated policies because anon has no EXECUTE on the private helpers.
DROP POLICY IF EXISTS "Scheduled drops hidden from anon" ON public.workout_drops;
CREATE POLICY "Scheduled drops hidden from anon" ON public.workout_drops
    AS RESTRICTIVE FOR SELECT TO anon
    USING (publish_at IS NULL OR publish_at <= NOW());

DROP POLICY IF EXISTS "Scheduled drops visible to their creator and admins" ON public.workout_drops;
CREATE POLICY "Scheduled drops visible to their creator and admins" ON public.workout_drops
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (
        publish_at IS NULL
        OR publish_at <= NOW()
        OR creator_id = (SELECT private.current_profile_id())
        OR (SELECT private.current_profile_role()) = 'ADMIN'
    );

-- ==========================================
-- 3. KEEP ATHLETE HISTORY WHEN A DROP IS DELETED
-- ==========================================
ALTER TABLE public.user_workout_logs ALTER COLUMN drop_id DROP NOT NULL;
ALTER TABLE public.user_workout_logs DROP CONSTRAINT IF EXISTS user_workout_logs_drop_id_fkey;
ALTER TABLE public.user_workout_logs ADD CONSTRAINT user_workout_logs_drop_id_fkey
    FOREIGN KEY (drop_id) REFERENCES public.workout_drops(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.user_workout_logs.drop_id IS
    'Completed drop; NULL once the drop was deleted by its creator (the aura history is kept).';

-- ==========================================
-- 4. FOLLOWS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.creator_follows (
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT creator_follows_pkey PRIMARY KEY (follower_id, creator_id),
    CONSTRAINT creator_follows_not_self CHECK (follower_id <> creator_id)
);
-- PK covers follower_id lookups ("who do I follow"); this one covers counts / FK cascades by creator.
CREATE INDEX IF NOT EXISTS idx_creator_follows_creator_id ON public.creator_follows (creator_id);

COMMENT ON TABLE public.creator_follows IS
    'Who follows which creator. Server-only (RLS on, no client grants); served by /api/v1/creators/** and /api/v1/me/following.';

-- Only CREATOR / ADMIN profiles can be followed (checked at follow time; a later demotion keeps
-- existing follows, but the public creator page and follow endpoint stop serving that profile).
CREATE OR REPLACE FUNCTION private.check_creator_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = NEW.creator_id AND p.role IN ('CREATOR', 'ADMIN')
    ) THEN
        RAISE EXCEPTION 'only creator profiles can be followed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.check_creator_follow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_creator_follows_creator_role ON public.creator_follows;
CREATE TRIGGER trg_creator_follows_creator_role BEFORE INSERT OR UPDATE OF creator_id ON public.creator_follows
    FOR EACH ROW EXECUTE FUNCTION private.check_creator_follow();

REVOKE ALL ON public.creator_follows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_follows TO service_role;
-- RLS on with no policies = deny-all for every non-BYPASSRLS role (defence in depth).
ALTER TABLE public.creator_follows ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 5. SERVER-ONLY FUNCTIONS
-- ==========================================
-- Follow a creator. Statuses: followed | already_following | profile_not_found | creator_not_found |
-- cannot_follow_self. Always returns follower_count for the creator (when found).
CREATE OR REPLACE FUNCTION public.follow_creator(p_follower_id UUID, p_creator_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_inserted INT;
    v_count BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_follower_id) THEN
        RETURN jsonb_build_object('status', 'profile_not_found');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id AND role IN ('CREATOR', 'ADMIN')) THEN
        RETURN jsonb_build_object('status', 'creator_not_found');
    END IF;
    IF p_follower_id = p_creator_id THEN
        RETURN jsonb_build_object('status', 'cannot_follow_self');
    END IF;

    INSERT INTO public.creator_follows (follower_id, creator_id)
    VALUES (p_follower_id, p_creator_id)
    ON CONFLICT ON CONSTRAINT creator_follows_pkey DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    SELECT count(*) INTO v_count FROM public.creator_follows WHERE creator_id = p_creator_id;
    RETURN jsonb_build_object(
        'status', CASE WHEN v_inserted = 1 THEN 'followed' ELSE 'already_following' END,
        'follower_count', v_count
    );
END;
$$;

-- Unfollow. Statuses: unfollowed | not_following. Always returns follower_count.
CREATE OR REPLACE FUNCTION public.unfollow_creator(p_follower_id UUID, p_creator_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_deleted INT;
    v_count BIGINT;
BEGIN
    DELETE FROM public.creator_follows WHERE follower_id = p_follower_id AND creator_id = p_creator_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    SELECT count(*) INTO v_count FROM public.creator_follows WHERE creator_id = p_creator_id;
    RETURN jsonb_build_object(
        'status', CASE WHEN v_deleted = 1 THEN 'unfollowed' ELSE 'not_following' END,
        'follower_count', v_count
    );
END;
$$;

-- Aggregate analytics for one creator over the last p_days UTC calendar days (today included):
-- window [today - (p_days - 1) 00:00 UTC, tomorrow 00:00 UTC). p_days is clamped to 1..90.
-- Returns {status: 'profile_not_found'} or {status: 'ok', from, to, days, totals, drops, series}.
-- Aggregates only; the creator's own completions are excluded; no athlete identities.
CREATE OR REPLACE FUNCTION public.creator_analytics(p_creator_id UUID, p_days INT DEFAULT 7, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := coalesce(p_now, NOW());
    v_days INT := least(greatest(coalesce(p_days, 7), 1), 90);
    v_today DATE := (coalesce(p_now, NOW()) AT TIME ZONE 'UTC')::date;
    v_from DATE;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id) THEN
        RETURN jsonb_build_object('status', 'profile_not_found');
    END IF;
    v_from := v_today - (v_days - 1);
    v_start := v_from::timestamp AT TIME ZONE 'UTC';
    v_end := (v_today + 1)::timestamp AT TIME ZONE 'UTC';

    WITH my_drops AS (
        SELECT d.id, d.title, d.publish_at, d.created_at, d.completions_count
        FROM public.workout_drops d
        WHERE d.creator_id = p_creator_id
    ),
    logs AS (
        SELECT l.drop_id, l.user_id, l.aura_earned, l.completed_at
        FROM public.user_workout_logs l
        JOIN my_drops d ON d.id = l.drop_id
        WHERE l.completed_at >= v_start AND l.completed_at < v_end
          AND l.user_id <> p_creator_id
    ),
    per_drop AS (
        SELECT g.drop_id, count(*) AS completions, count(DISTINCT g.user_id) AS athletes, max(g.completed_at) AS last_at
        FROM logs g GROUP BY g.drop_id
    ),
    per_day AS (
        SELECT (g.completed_at AT TIME ZONE 'UTC')::date AS day, count(*) AS completions
        FROM logs g GROUP BY 1
    ),
    days AS (
        SELECT (v_from + s.i) AS day FROM generate_series(0, v_days - 1) AS s(i)
    )
    SELECT jsonb_build_object(
        'status', 'ok',
        'from', v_from,
        'to', v_today,
        'days', v_days,
        'totals', jsonb_build_object(
            'followers', (SELECT count(*) FROM public.creator_follows f WHERE f.creator_id = p_creator_id),
            'live_drops', (SELECT count(*) FROM my_drops d WHERE d.publish_at IS NULL OR d.publish_at <= v_now),
            'scheduled_drops', (SELECT count(*) FROM my_drops d WHERE d.publish_at > v_now),
            'completions', (SELECT count(*) FROM logs),
            'unique_athletes', (SELECT count(DISTINCT g.user_id) FROM logs g),
            'aura_awarded', (SELECT coalesce(sum(g.aura_earned), 0) FROM logs g)
        ),
        'drops', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'drop_id', d.id,
                       'title', d.title,
                       'publish_at', d.publish_at,
                       'created_at', d.created_at,
                       'all_time_completions', d.completions_count,
                       'completions', coalesce(p.completions, 0),
                       'unique_athletes', coalesce(p.athletes, 0),
                       'last_completed_on', (p.last_at AT TIME ZONE 'UTC')::date
                   ) ORDER BY coalesce(p.completions, 0) DESC, d.created_at DESC, d.id)
            FROM my_drops d LEFT JOIN per_drop p ON p.drop_id = d.id
        ), '[]'::jsonb),
        'series', (
            SELECT jsonb_agg(jsonb_build_object('date', ds.day, 'completions', coalesce(pd.completions, 0)) ORDER BY ds.day)
            FROM days ds LEFT JOIN per_day pd ON pd.day = ds.day
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.follow_creator(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unfollow_creator(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creator_analytics(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follow_creator(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.unfollow_creator(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.creator_analytics(UUID, INT, TIMESTAMPTZ) TO service_role;

-- ==========================================
-- 6. INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_user_workout_logs_drop_completed ON public.user_workout_logs (drop_id, completed_at);
-- Redundant now (the composite index's leading column covers drop_id lookups and the FK).
DROP INDEX IF EXISTS public.idx_user_workout_logs_drop_id;
