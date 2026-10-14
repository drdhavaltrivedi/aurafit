-- AuraFit squads (guilds): real, server-managed squads of up to 5 hunters.
--
-- Evolves the seed-shaped `squads` table and `profiles.squad_id` from 20261013120000_aurafit_init.sql:
--
--   1. private.new_squad_invite_code()   8-char invite code (alphabet without 0/O/1/I), strong random.
--   2. Columns: squads.invite_code (unique), squads.weekly_goal (NULL = 5,000 x members),
--      profiles.squad_joined_at (set by a trigger whenever squad_id changes).
--   3. Data cleanup: fabricated/orphan squads (no members) are deleted; surviving rows are normalised
--      to the new name/tag/icon rules and get a leader who is a member.
--   4. Constraints + indexes: name 3-40 chars (trimmed) unique case-insensitively, tag ^[A-Z0-9]{2,6}$,
--      icon (column `avatar`, kept for compatibility) one of ICON_KEYS, weekly goal 1,000-50,000,
--      completed_at indexes on both ledgers for the weekly window.
--   5. Legacy seed counters dropped (member_count, streak_days, weekly_goal_progress, status and the
--      squad_status_enum type). squads.total_aura stays only because the init migration indexes it;
--      it is unused (weekly aura is always computed from the ledgers).
--   6. Triggers: squad_joined_at bookkeeping; account deletion hands leadership to the
--      longest-standing member, or deletes the squad when its last member is gone.
--   7. Privileges: clients get NO write access to squads; public read is limited to non-sensitive
--      columns (never invite_code / leader_id), and profiles.squad_id / squad_joined_at are no
--      longer readable through the Data API (membership is visible only to squad members, via the API).
--   8. Server-only game functions (SECURITY INVOKER, EXECUTE to service_role only, same model as
--      public.complete_quest): create_squad, join_squad, leave_squad, remove_squad_member,
--      regenerate_squad_invite_code, update_squad, get_member_squad, squad_leaderboard, squad_activity.
--
-- Weekly aura = sum of aura_earned in user_quest_logs + user_workout_logs with completed_at in the
-- current ISO week [Monday 00:00 UTC, next Monday 00:00 UTC) — the same window as the weekly reset
-- (private.reset_weekly_aura, pg_cron '0 0 * * 1'), for the squad's CURRENT members. Never the
-- profiles.weekly_aura_gained counter.
--
-- Concurrency: every membership change locks the squad row first (SELECT ... FOR UPDATE), then the
-- profile row(s), always in that order, so joins cannot exceed max_members and leave / remove / join
-- cannot deadlock each other. create_squad only locks the creator's profile (the new squad row is not
-- visible to anyone else yet).
--
-- Idempotent: safe to re-run (the PGlite tests apply every migration twice). Do not edit after it has
-- been applied; add a new migration instead (then run `npm run db:sync`).
-- Values mirror packages/shared/src/squads.ts (SQUAD_*, INVITE_CODE_ALPHABET) and icons.ts (ICON_KEYS).

-- ==========================================
-- 1. INVITE CODES
-- ==========================================
-- 8 symbols from a 32-symbol alphabet (no 0/O/1/I): 32^8 ~ 1.1e12 codes. Bytes come from
-- gen_random_uuid() (pg_strong_random); bytes 0-5 and 10-11 of a v4 UUID are fully random and
-- 256 is a multiple of 32, so `byte % 32` is unbiased.
CREATE OR REPLACE FUNCTION private.new_squad_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_bytes BYTEA := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code TEXT := '';
    v_i INT;
BEGIN
    FOREACH v_i IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 10, 11] LOOP
        v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
    END LOOP;
    RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION private.new_squad_invite_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.new_squad_invite_code() TO service_role;

-- ISO week window [Monday 00:00 UTC, next Monday 00:00 UTC) containing p_now.
CREATE OR REPLACE FUNCTION private.squad_week_start(p_now TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT date_trunc('week', p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
$$;

REVOKE ALL ON FUNCTION private.squad_week_start(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.squad_week_start(TIMESTAMPTZ) TO service_role;

-- ==========================================
-- 2. COLUMNS
-- ==========================================
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS invite_code TEXT NOT NULL DEFAULT private.new_squad_invite_code();
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS weekly_goal INT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS squad_joined_at TIMESTAMPTZ;

COMMENT ON COLUMN public.squads.invite_code IS 'Current invite code (8 chars, no 0/O/1/I). Server-only; regenerating invalidates the old code.';
COMMENT ON COLUMN public.squads.weekly_goal IS 'Leader-set weekly aura target (1,000-50,000). NULL = 5,000 x current member count.';
COMMENT ON COLUMN public.squads.avatar IS 'Squad icon: one of ICON_KEYS (packages/shared/src/icons.ts). Exposed as `icon` by the API.';
COMMENT ON COLUMN public.squads.leader_id IS 'Squad leader; always a current member (maintained by the squad functions and trg_profiles_squad_member_deleted).';
COMMENT ON COLUMN public.profiles.squad_joined_at IS 'When the profile joined its current squad (NULL when squad_id is NULL). Maintained by trg_profiles_squad_joined_at.';

-- Existing members (seed / pre-squads data): treat their last profile update as the join time.
UPDATE public.profiles SET squad_joined_at = coalesce(updated_at, created_at, NOW())
WHERE squad_id IS NOT NULL AND squad_joined_at IS NULL;
UPDATE public.profiles SET squad_joined_at = NULL WHERE squad_id IS NULL AND squad_joined_at IS NOT NULL;

-- ==========================================
-- 3. DATA CLEANUP (fabricated / pre-v1 squads)
-- ==========================================
-- A squad without members cannot exist in the new model (the last member leaving deletes it).
DELETE FROM public.squads s WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.squad_id = s.id);

-- Normalise surviving rows so the constraints below can be added. Only rows that violate a rule
-- are touched, so re-running is a no-op.
UPDATE public.squads SET avatar = 'swords'
WHERE avatar IS NULL OR avatar NOT IN ('zap', 'flame', 'sparkles', 'skull', 'swords', 'car', 'dog', 'sofa', 'dumbbell', 'trophy', 'shield', 'crown');

UPDATE public.squads SET tag = 'SQ' || upper(substr(md5(id::text), 1, 4))
WHERE tag !~ '^[A-Z0-9]{2,6}$';

UPDATE public.squads SET name = left(btrim(regexp_replace(name, '\s+', ' ', 'g')), 40)
WHERE name <> btrim(name) OR char_length(name) > 40 OR name ~ '\s\s';
UPDATE public.squads SET name = 'Squad ' || tag WHERE char_length(name) < 3;
-- Case-insensitive duplicates: keep the oldest name, suffix the others with their (unique) tag.
UPDATE public.squads s SET name = left(s.name, 33) || ' ' || s.tag
WHERE EXISTS (
    SELECT 1 FROM public.squads o
    WHERE lower(o.name) = lower(s.name) AND (o.created_at, o.id) < (s.created_at, s.id)
);

UPDATE public.squads SET max_members = 5 WHERE max_members <> 5;

-- Leader must be a current member: otherwise the longest-standing member leads.
UPDATE public.squads s SET leader_id = (
    SELECT p.id FROM public.profiles p WHERE p.squad_id = s.id ORDER BY p.squad_joined_at, p.id LIMIT 1
)
WHERE s.leader_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.leader_id AND p.squad_id = s.id);

-- ==========================================
-- 4. CONSTRAINTS + INDEXES
-- ==========================================
ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_name_check;
ALTER TABLE public.squads ADD CONSTRAINT squads_name_check
    CHECK (name = btrim(name) AND char_length(name) BETWEEN 3 AND 40 AND name !~ '\s\s');

ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_tag_format;
ALTER TABLE public.squads ADD CONSTRAINT squads_tag_format CHECK (tag ~ '^[A-Z0-9]{2,6}$');

ALTER TABLE public.squads ALTER COLUMN avatar SET DEFAULT 'swords';
ALTER TABLE public.squads ALTER COLUMN avatar SET NOT NULL;
ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_icon_key;
ALTER TABLE public.squads ADD CONSTRAINT squads_icon_key
    CHECK (avatar IN ('zap', 'flame', 'sparkles', 'skull', 'swords', 'car', 'dog', 'sofa', 'dumbbell', 'trophy', 'shield', 'crown'));

ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_invite_code_format;
ALTER TABLE public.squads ADD CONSTRAINT squads_invite_code_format
    CHECK (invite_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$');

ALTER TABLE public.squads DROP CONSTRAINT IF EXISTS squads_weekly_goal_range;
ALTER TABLE public.squads ADD CONSTRAINT squads_weekly_goal_range
    CHECK (weekly_goal IS NULL OR weekly_goal BETWEEN 1000 AND 50000);

ALTER TABLE public.squads ALTER COLUMN max_members SET DEFAULT 5;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_squad_joined_at_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_squad_joined_at_check
    CHECK ((squad_id IS NULL) = (squad_joined_at IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS squads_invite_code_key ON public.squads (invite_code);
CREATE UNIQUE INDEX IF NOT EXISTS squads_name_lower_key ON public.squads (lower(name));
-- Weekly windows over the ledgers (leaderboard aggregates every squad member's week).
CREATE INDEX IF NOT EXISTS idx_user_quest_logs_completed_at ON public.user_quest_logs (completed_at);
CREATE INDEX IF NOT EXISTS idx_user_workout_logs_completed_at ON public.user_workout_logs (completed_at);
-- Members of a squad in join order (leader handover).
DROP INDEX IF EXISTS public.idx_profiles_squad_id;
CREATE INDEX IF NOT EXISTS idx_profiles_squad_id_joined ON public.profiles (squad_id, squad_joined_at) WHERE squad_id IS NOT NULL;

-- ==========================================
-- 5. LEGACY SEED COUNTERS
-- ==========================================
ALTER TABLE public.squads DROP COLUMN IF EXISTS member_count;
ALTER TABLE public.squads DROP COLUMN IF EXISTS streak_days;
ALTER TABLE public.squads DROP COLUMN IF EXISTS weekly_goal_progress;
ALTER TABLE public.squads DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS public.squad_status_enum;
COMMENT ON COLUMN public.squads.total_aura IS 'DEPRECATED, unused (kept because the init migration indexes it). Squad aura is computed from the ledgers.';

-- ==========================================
-- 6. TRIGGERS
-- ==========================================
-- squad_joined_at follows squad_id: set (clock time) when it changes to a squad, cleared when it is
-- cleared (including the FK's ON DELETE SET NULL when a squad is deleted).
CREATE OR REPLACE FUNCTION private.sync_squad_joined_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.squad_id IS NULL THEN
        NEW.squad_joined_at := NULL;
    ELSIF TG_OP = 'INSERT' OR NEW.squad_id IS DISTINCT FROM OLD.squad_id THEN
        NEW.squad_joined_at := clock_timestamp();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_squad_joined_at ON public.profiles;
CREATE TRIGGER trg_profiles_squad_joined_at BEFORE INSERT OR UPDATE OF squad_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION private.sync_squad_joined_at();

-- Account deletion (auth.users -> profiles cascade): the squad keeps going with the
-- longest-standing member as leader, or is deleted when nobody is left.
CREATE OR REPLACE FUNCTION private.squad_member_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_next UUID;
BEGIN
    PERFORM 1 FROM public.squads WHERE id = OLD.squad_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT p.id INTO v_next FROM public.profiles p
    WHERE p.squad_id = OLD.squad_id ORDER BY p.squad_joined_at, p.id LIMIT 1;
    IF v_next IS NULL THEN
        DELETE FROM public.squads WHERE id = OLD.squad_id;
    ELSE
        UPDATE public.squads SET leader_id = v_next
        WHERE id = OLD.squad_id AND (leader_id IS NULL OR leader_id = OLD.id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_squad_member_deleted ON public.profiles;
CREATE TRIGGER trg_profiles_squad_member_deleted AFTER DELETE ON public.profiles
    FOR EACH ROW WHEN (OLD.squad_id IS NOT NULL) EXECUTE FUNCTION private.squad_member_deleted();

REVOKE ALL ON FUNCTION private.sync_squad_joined_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.squad_member_deleted() FROM PUBLIC, anon, authenticated;

-- ==========================================
-- 7. PRIVILEGES + RLS
-- ==========================================
-- No client writes, ever: every change goes through the functions below (service_role).
REVOKE ALL ON public.squads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squads TO service_role;
-- Public, non-sensitive columns only (leaderboard-style data). Never invite_code or leader_id.
GRANT SELECT (id, name, tag, avatar, max_members, weekly_goal, created_at) ON public.squads TO anon, authenticated;

ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Squads readable by everyone" ON public.squads;
CREATE POLICY "Squads readable by everyone" ON public.squads
    FOR SELECT TO anon, authenticated USING (true);

-- Squad membership is private to the squad (served by GET /api/v1/squads/me to members only).
REVOKE SELECT (squad_id, squad_joined_at) ON public.profiles FROM anon, authenticated;
REVOKE INSERT (squad_id, squad_joined_at) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (squad_id, squad_joined_at) ON public.profiles FROM anon, authenticated;

-- ==========================================
-- 8. SERVER-ONLY SQUAD FUNCTIONS
-- ==========================================
-- Called by the Next.js server with the secret key via supabase-js `.rpc()`. Every function returns
-- jsonb {status, ...}; expected outcomes are statuses, not exceptions. Input shape (name/tag/icon/
-- code/goal) is validated in TypeScript first (packages/shared/src/squads.ts) and again by the
-- CHECK constraints above.

-- Weekly aura per CURRENT member of a squad for the window [p_start, p_start + 7 days).
CREATE OR REPLACE FUNCTION private.squad_member_week_aura(p_squad_id UUID, p_start TIMESTAMPTZ)
RETURNS TABLE (profile_id UUID, weekly_aura BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT p.id,
           coalesce((SELECT sum(q.aura_earned) FROM public.user_quest_logs q
                     WHERE q.user_id = p.id AND q.completed_at >= p_start AND q.completed_at < p_start + INTERVAL '7 days'), 0)
         + coalesce((SELECT sum(w.aura_earned) FROM public.user_workout_logs w
                     WHERE w.user_id = p.id AND w.completed_at >= p_start AND w.completed_at < p_start + INTERVAL '7 days'), 0)
    FROM public.profiles p
    WHERE p.squad_id = p_squad_id;
$$;

-- Every squad with >= 1 member, ranked by weekly aura (ties: more members first is NOT used, so a
-- small squad is never ranked above an equal-aura bigger one by size; ties fall back to the older
-- squad, then id, which is stable).
CREATE OR REPLACE FUNCTION private.squad_week_totals(p_start TIMESTAMPTZ)
RETURNS TABLE (squad_id UUID, member_count INT, weekly_aura BIGINT, rank BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH ledger AS (
        SELECT q.user_id, q.aura_earned::BIGINT AS aura FROM public.user_quest_logs q
        WHERE q.completed_at >= p_start AND q.completed_at < p_start + INTERVAL '7 days'
        UNION ALL
        SELECT w.user_id, w.aura_earned::BIGINT FROM public.user_workout_logs w
        WHERE w.completed_at >= p_start AND w.completed_at < p_start + INTERVAL '7 days'
    ),
    per_user AS (
        SELECT l.user_id, sum(l.aura) AS aura FROM ledger l GROUP BY l.user_id
    ),
    per_squad AS (
        SELECT p.squad_id, count(*)::INT AS member_count, coalesce(sum(u.aura), 0)::BIGINT AS weekly_aura
        FROM public.profiles p
        LEFT JOIN per_user u ON u.user_id = p.id
        WHERE p.squad_id IS NOT NULL
        GROUP BY p.squad_id
    )
    SELECT ps.squad_id, ps.member_count, ps.weekly_aura,
           row_number() OVER (ORDER BY ps.weekly_aura DESC, s.created_at, s.id)
    FROM per_squad ps
    JOIN public.squads s ON s.id = ps.squad_id;
$$;

REVOKE ALL ON FUNCTION private.squad_member_week_aura(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.squad_week_totals(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.squad_member_week_aura(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION private.squad_week_totals(TIMESTAMPTZ) TO service_role;

-- Creates a squad led by p_profile_id. Statuses: created {squad_id} | profile_not_found |
-- already_in_squad | name_taken | tag_taken.
CREATE OR REPLACE FUNCTION public.create_squad(
    p_profile_id UUID,
    p_name TEXT,
    p_tag TEXT,
    p_icon TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
    v_squad_id UUID;
    v_constraint TEXT;
    v_attempt INT := 0;
BEGIN
    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'profile_not_found');
    END IF;
    IF v_profile.squad_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_in_squad', 'squad_id', v_profile.squad_id);
    END IF;

    LOOP
        BEGIN
            INSERT INTO public.squads (name, tag, avatar, leader_id, max_members, invite_code)
            VALUES (btrim(p_name), p_tag, coalesce(p_icon, 'swords'), p_profile_id, 5, private.new_squad_invite_code())
            RETURNING id INTO v_squad_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
            IF v_constraint = 'squads_name_lower_key' THEN
                RETURN jsonb_build_object('status', 'name_taken');
            ELSIF v_constraint = 'squads_tag_key' THEN
                RETURN jsonb_build_object('status', 'tag_taken');
            END IF;
            -- Invite code collision (~1 in 1e12): draw again.
            v_attempt := v_attempt + 1;
            IF v_attempt >= 5 THEN
                RAISE;
            END IF;
        END;
    END LOOP;

    UPDATE public.profiles SET squad_id = v_squad_id WHERE id = p_profile_id;
    RETURN jsonb_build_object('status', 'created', 'squad_id', v_squad_id);
END;
$$;

-- Joins the squad that currently owns p_code. Statuses: joined {squad_id} | invalid_code |
-- profile_not_found | already_in_squad {squad_id} | full.
CREATE OR REPLACE FUNCTION public.join_squad(p_profile_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad public.squads%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_members INT;
BEGIN
    -- Squad row first (lock order: squad -> profile), so concurrent joins serialise per squad.
    SELECT * INTO v_squad FROM public.squads WHERE invite_code = upper(btrim(coalesce(p_code, ''))) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'invalid_code');
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'profile_not_found');
    END IF;
    IF v_profile.squad_id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'already_in_squad', 'squad_id', v_profile.squad_id);
    END IF;

    SELECT count(*) INTO v_members FROM public.profiles WHERE squad_id = v_squad.id;
    IF v_members >= v_squad.max_members THEN
        RETURN jsonb_build_object('status', 'full');
    END IF;

    UPDATE public.profiles SET squad_id = v_squad.id WHERE id = p_profile_id;
    RETURN jsonb_build_object('status', 'joined', 'squad_id', v_squad.id);
END;
$$;

-- Leaves the current squad. Leadership passes to the longest-standing remaining member; the last
-- member leaving deletes the squad. Statuses: left {squad_id, squad_deleted, new_leader_id} |
-- not_in_squad | profile_not_found.
CREATE OR REPLACE FUNCTION public.leave_squad(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad_id UUID;
    v_squad public.squads%ROWTYPE;
    v_profile public.profiles%ROWTYPE;
    v_next UUID;
    v_try INT := 0;
BEGIN
    LOOP
        v_try := v_try + 1;
        SELECT squad_id INTO v_squad_id FROM public.profiles WHERE id = p_profile_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'profile_not_found');
        END IF;
        IF v_squad_id IS NULL THEN
            RETURN jsonb_build_object('status', 'not_in_squad');
        END IF;
        SELECT * INTO v_squad FROM public.squads WHERE id = v_squad_id FOR UPDATE;
        SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
        -- Membership changed between the unlocked read and the locks (removed / squad deleted): retry.
        EXIT WHEN v_squad.id IS NOT NULL AND v_profile.squad_id = v_squad.id;
        IF v_try >= 3 THEN
            RETURN jsonb_build_object('status', 'not_in_squad');
        END IF;
    END LOOP;

    UPDATE public.profiles SET squad_id = NULL WHERE id = p_profile_id;

    SELECT p.id INTO v_next FROM public.profiles p
    WHERE p.squad_id = v_squad.id ORDER BY p.squad_joined_at, p.id LIMIT 1;

    IF v_next IS NULL THEN
        DELETE FROM public.squads WHERE id = v_squad.id;
        RETURN jsonb_build_object('status', 'left', 'squad_id', v_squad.id, 'squad_deleted', true, 'new_leader_id', NULL);
    END IF;

    IF v_squad.leader_id IS NULL OR v_squad.leader_id = p_profile_id THEN
        UPDATE public.squads SET leader_id = v_next WHERE id = v_squad.id;
        RETURN jsonb_build_object('status', 'left', 'squad_id', v_squad.id, 'squad_deleted', false, 'new_leader_id', v_next);
    END IF;
    RETURN jsonb_build_object('status', 'left', 'squad_id', v_squad.id, 'squad_deleted', false, 'new_leader_id', NULL);
END;
$$;

-- Leader removes another member. Statuses: removed | not_in_squad | not_leader | member_not_found |
-- cannot_remove_self.
CREATE OR REPLACE FUNCTION public.remove_squad_member(p_actor_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad_id UUID;
    v_squad public.squads%ROWTYPE;
    v_target public.profiles%ROWTYPE;
BEGIN
    IF p_actor_id = p_target_id THEN
        RETURN jsonb_build_object('status', 'cannot_remove_self');
    END IF;
    SELECT squad_id INTO v_squad_id FROM public.profiles WHERE id = p_actor_id;
    IF v_squad_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    SELECT * INTO v_squad FROM public.squads WHERE id = v_squad_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    -- The leader is always a member, so this also re-checks the actor's membership under the lock.
    IF v_squad.leader_id IS DISTINCT FROM p_actor_id THEN
        RETURN jsonb_build_object('status', 'not_leader');
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND OR v_target.squad_id IS DISTINCT FROM v_squad.id THEN
        RETURN jsonb_build_object('status', 'member_not_found');
    END IF;

    UPDATE public.profiles SET squad_id = NULL WHERE id = p_target_id;
    RETURN jsonb_build_object('status', 'removed', 'squad_id', v_squad.id);
END;
$$;

-- Leader replaces the invite code (the old one stops working immediately). Statuses:
-- regenerated {invite_code} | not_in_squad | not_leader.
CREATE OR REPLACE FUNCTION public.regenerate_squad_invite_code(p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad_id UUID;
    v_squad public.squads%ROWTYPE;
    v_code TEXT;
    v_attempt INT := 0;
BEGIN
    SELECT squad_id INTO v_squad_id FROM public.profiles WHERE id = p_actor_id;
    IF v_squad_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    SELECT * INTO v_squad FROM public.squads WHERE id = v_squad_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    IF v_squad.leader_id IS DISTINCT FROM p_actor_id THEN
        RETURN jsonb_build_object('status', 'not_leader');
    END IF;
    LOOP
        BEGIN
            v_code := private.new_squad_invite_code();
            UPDATE public.squads SET invite_code = v_code WHERE id = v_squad.id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_attempt := v_attempt + 1;
            IF v_attempt >= 5 THEN
                RAISE;
            END IF;
        END;
    END LOOP;
    RETURN jsonb_build_object('status', 'regenerated', 'invite_code', v_code);
END;
$$;

-- Leader edits the squad. p_patch keys (all optional): name (text), icon (text),
-- weekly_goal (int 1000-50000, or null = automatic 5,000 x members). Absent keys are unchanged.
-- Statuses: updated | not_in_squad | not_leader | name_taken.
CREATE OR REPLACE FUNCTION public.update_squad(p_actor_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_squad_id UUID;
    v_squad public.squads%ROWTYPE;
    v_patch JSONB := coalesce(p_patch, '{}'::jsonb);
    v_constraint TEXT;
BEGIN
    SELECT squad_id INTO v_squad_id FROM public.profiles WHERE id = p_actor_id;
    IF v_squad_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    SELECT * INTO v_squad FROM public.squads WHERE id = v_squad_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;
    IF v_squad.leader_id IS DISTINCT FROM p_actor_id THEN
        RETURN jsonb_build_object('status', 'not_leader');
    END IF;
    BEGIN
        UPDATE public.squads SET
            name = CASE WHEN v_patch ? 'name' THEN btrim(v_patch ->> 'name') ELSE name END,
            avatar = CASE WHEN v_patch ? 'icon' THEN v_patch ->> 'icon' ELSE avatar END,
            weekly_goal = CASE WHEN v_patch ? 'weekly_goal' THEN (v_patch ->> 'weekly_goal')::INT ELSE weekly_goal END
        WHERE id = v_squad.id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        IF v_constraint = 'squads_name_lower_key' THEN
            RETURN jsonb_build_object('status', 'name_taken');
        END IF;
        RAISE;
    END;
    RETURN jsonb_build_object('status', 'updated', 'squad_id', v_squad.id);
END;
$$;

-- The caller's squad with members and this week's per-member aura, or {status: 'not_in_squad'}.
-- invite_code is included ONLY when p_profile_id is the leader.
CREATE OR REPLACE FUNCTION public.get_member_squad(p_profile_id UUID, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_start TIMESTAMPTZ := private.squad_week_start(coalesce(p_now, NOW()));
    v_squad public.squads%ROWTYPE;
    v_members JSONB;
    v_rank BIGINT;
BEGIN
    SELECT s.* INTO v_squad
    FROM public.profiles p JOIN public.squads s ON s.id = p.squad_id
    WHERE p.id = p_profile_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'profile_id', p.id,
               'username', p.username,
               'handle', p.handle,
               'avatar_url', p.avatar_url,
               'rank', p.rank,
               'joined_at', p.squad_joined_at,
               'weekly_aura', a.weekly_aura
           ) ORDER BY a.weekly_aura DESC, p.squad_joined_at, p.id), '[]'::jsonb)
    INTO v_members
    FROM public.profiles p
    JOIN private.squad_member_week_aura(v_squad.id, v_start) a ON a.profile_id = p.id;

    SELECT t.rank INTO v_rank FROM private.squad_week_totals(v_start) t WHERE t.squad_id = v_squad.id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'week_start', v_start,
        'week_end', v_start + INTERVAL '7 days',
        'rank', v_rank,
        'squad', jsonb_build_object(
            'id', v_squad.id,
            'name', v_squad.name,
            'tag', v_squad.tag,
            'icon', v_squad.avatar,
            'max_members', v_squad.max_members,
            'weekly_goal', v_squad.weekly_goal,
            'leader_id', v_squad.leader_id,
            'created_at', v_squad.created_at,
            'invite_code', CASE WHEN v_squad.leader_id = p_profile_id THEN v_squad.invite_code END
        ),
        'members', v_members
    );
END;
$$;

-- Public weekly leaderboard: top p_limit squads (1-100). No member details.
CREATE OR REPLACE FUNCTION public.squad_leaderboard(p_limit INT DEFAULT 20, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
    rank BIGINT,
    squad_id UUID,
    name TEXT,
    tag TEXT,
    icon TEXT,
    member_count INT,
    max_members INT,
    weekly_aura BIGINT,
    week_start TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH w AS (SELECT private.squad_week_start(coalesce(p_now, NOW())) AS start)
    SELECT t.rank, s.id, s.name::TEXT, s.tag::TEXT, s.avatar, t.member_count, s.max_members, t.weekly_aura, w.start
    FROM w
    CROSS JOIN LATERAL private.squad_week_totals(w.start) t
    JOIN public.squads s ON s.id = t.squad_id
    ORDER BY t.rank
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- This week's completions by the caller's squad members, newest first (members only).
-- Returns {status: 'not_in_squad'} or {status: 'ok', week_start, items: [...]}.
CREATE OR REPLACE FUNCTION public.squad_activity(p_profile_id UUID, p_limit INT DEFAULT 30, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_start TIMESTAMPTZ := private.squad_week_start(coalesce(p_now, NOW()));
    v_squad_id UUID;
    v_items JSONB;
BEGIN
    SELECT squad_id INTO v_squad_id FROM public.profiles WHERE id = p_profile_id;
    IF v_squad_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_in_squad');
    END IF;

    WITH feed AS (
        SELECT q.id, 'QUEST' AS kind, q.user_id, qs.title, q.aura_earned, q.completed_at
        FROM public.user_quest_logs q
        JOIN public.profiles p ON p.id = q.user_id AND p.squad_id = v_squad_id
        JOIN public.quests qs ON qs.id = q.quest_id
        WHERE q.completed_at >= v_start AND q.completed_at < v_start + INTERVAL '7 days'
        UNION ALL
        SELECT w.id, 'WORKOUT', w.user_id, d.title, w.aura_earned, w.completed_at
        FROM public.user_workout_logs w
        JOIN public.profiles p ON p.id = w.user_id AND p.squad_id = v_squad_id
        JOIN public.workout_drops d ON d.id = w.drop_id
        WHERE w.completed_at >= v_start AND w.completed_at < v_start + INTERVAL '7 days'
    ),
    top AS (
        SELECT * FROM feed ORDER BY completed_at DESC, id
        LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id,
               'kind', t.kind,
               'profile_id', t.user_id,
               'username', p.username,
               'handle', p.handle,
               'title', t.title,
               'aura', t.aura_earned,
               'completed_at', t.completed_at
           ) ORDER BY t.completed_at DESC, t.id), '[]'::jsonb)
    INTO v_items
    FROM top t JOIN public.profiles p ON p.id = t.user_id;

    RETURN jsonb_build_object('status', 'ok', 'week_start', v_start, 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.create_squad(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_squad(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_squad(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_squad_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.regenerate_squad_invite_code(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_squad(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_member_squad(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.squad_leaderboard(INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.squad_activity(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_squad(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_squad(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.leave_squad(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_squad_member(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_squad_invite_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_squad(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_member_squad(UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.squad_leaderboard(INT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.squad_activity(UUID, INT, TIMESTAMPTZ) TO service_role;
