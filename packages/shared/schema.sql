-- AuraFit Production PostgreSQL / Supabase Database Schema
-- Includes Row Level Security (RLS) policies and Role-Based Access Control (RBAC).
--
-- Target: Supabase (PostgreSQL 15+). Uses the `auth` schema (auth.users, auth.uid())
-- and the built-in `anon` / `authenticated` roles. The script is idempotent and can
-- be re-run safely.
--
-- Trust model:
--   * Clients (anon / authenticated) may READ public data and edit only cosmetic
--     fields of their own profile.
--   * Anything that affects the aura economy (aura_points, rank, stats, streaks,
--     quest completion logs, leaderboards) is written by the server using the
--     service_role key (which bypasses RLS) after validation in /api/sync.
--   * Values here must stay in sync with packages/shared/src (RANK_THRESHOLDS,
--     MAX_AURA_PER_SYNC, ...). packages/shared/test/schema.test.ts checks this.

-- gen_random_uuid() is built into PostgreSQL 13+; no extension needed.

-- ==========================================
-- 1. ENUMS (idempotent)
-- ==========================================
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('MEMBER', 'CREATOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE hunter_rank_enum AS ENUM ('E-RANK', 'D-RANK', 'C-RANK', 'B-RANK', 'A-RANK', 'S-RANK', 'MONARCH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE quest_category_enum AS ENUM ('DAILY_QUEST', 'BOSS_RAID', 'MOVEMENT_SNACK', 'SQUAD_MISSION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE quest_difficulty_enum AS ENUM ('CASUAL', 'HARD', 'NIGHTMARE', 'EXTREME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workout_difficulty_enum AS ENUM ('NOVICE', 'HUNTER', 'BEAST', 'SHADOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE workout_category_enum AS ENUM ('STRENGTH', 'HIIT', 'POSTURE_RESET', 'CARDIO_SNACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE squad_status_enum AS ENUM ('LOCKED_IN', 'ON_FIRE', 'NEEDS_SAVING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- 2. SHARED TRIGGER FUNCTIONS
-- ==========================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- Keeps profiles.rank consistent with aura_points.
-- Thresholds mirror RANK_THRESHOLDS in packages/shared/src/index.ts.
CREATE OR REPLACE FUNCTION rank_for_aura(aura BIGINT)
RETURNS hunter_rank_enum
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN aura >= 60000 THEN 'MONARCH'
        WHEN aura >= 30000 THEN 'S-RANK'
        WHEN aura >= 15000 THEN 'A-RANK'
        WHEN aura >= 7000  THEN 'B-RANK'
        WHEN aura >= 3000  THEN 'C-RANK'
        WHEN aura >= 1000  THEN 'D-RANK'
        ELSE 'E-RANK'
    END::hunter_rank_enum;
$$;

CREATE OR REPLACE FUNCTION sync_profile_rank()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.rank := rank_for_aura(NEW.aura_points);
    RETURN NEW;
END;
$$;

-- ==========================================
-- 3. GYMS (leaderboard doubles as the gym registry)
-- ==========================================
CREATE TABLE IF NOT EXISTS gym_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_name VARCHAR(150) NOT NULL UNIQUE,
    city VARCHAR(100) NOT NULL,
    active_squads INT NOT NULL DEFAULT 0 CHECK (active_squads >= 0),
    total_aura_earned BIGINT NOT NULL DEFAULT 0 CHECK (total_aura_earned >= 0),
    top_hunter_handle VARCHAR(50),
    growth_rate VARCHAR(50) DEFAULT '+0%',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 4. USER PROFILES
-- ==========================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL CHECK (char_length(btrim(username)) > 0),
    handle VARCHAR(50) NOT NULL UNIQUE CHECK (handle ~ '^@[A-Za-z0-9_.]{2,49}$'),
    role user_role_enum NOT NULL DEFAULT 'MEMBER',
    avatar_url TEXT CHECK (avatar_url IS NULL OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 2048)),
    title VARCHAR(100) DEFAULT 'Hunter in Training',
    bio TEXT CHECK (bio IS NULL OR char_length(bio) <= 500),
    aura_points BIGINT NOT NULL DEFAULT 0 CHECK (aura_points >= 0),
    rank hunter_rank_enum NOT NULL DEFAULT 'E-RANK',
    level INT NOT NULL DEFAULT 1 CHECK (level >= 1),
    str_stat INT NOT NULL DEFAULT 50 CHECK (str_stat BETWEEN 0 AND 100),
    agi_stat INT NOT NULL DEFAULT 50 CHECK (agi_stat BETWEEN 0 AND 100),
    end_stat INT NOT NULL DEFAULT 50 CHECK (end_stat BETWEEN 0 AND 100),
    rec_stat INT NOT NULL DEFAULT 50 CHECK (rec_stat BETWEEN 0 AND 100),
    streak_days INT NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
    streak_shields INT NOT NULL DEFAULT 2 CHECK (streak_shields >= 0),
    squad_id UUID, -- FK added below (squads references profiles too)
    gym_id UUID REFERENCES gym_leaderboard(id) ON DELETE SET NULL,
    total_workouts INT NOT NULL DEFAULT 0 CHECK (total_workouts >= 0),
    weekly_aura_gained BIGINT NOT NULL DEFAULT 0 CHECK (weekly_aura_gained >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 5. SQUADS
-- ==========================================
CREATE TABLE IF NOT EXISTS squads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    tag VARCHAR(20) NOT NULL UNIQUE,
    avatar TEXT DEFAULT '⚔️',
    total_aura BIGINT NOT NULL DEFAULT 0 CHECK (total_aura >= 0),
    leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    member_count INT NOT NULL DEFAULT 1,
    max_members INT NOT NULL DEFAULT 5 CHECK (max_members BETWEEN 1 AND 50),
    streak_days INT NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
    weekly_goal_progress INT NOT NULL DEFAULT 0 CHECK (weekly_goal_progress BETWEEN 0 AND 100),
    status squad_status_enum NOT NULL DEFAULT 'LOCKED_IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT squads_member_count_range CHECK (member_count BETWEEN 0 AND max_members)
);

DO $$ BEGIN
    ALTER TABLE profiles
        ADD CONSTRAINT profiles_squad_id_fkey
        FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- 6. QUESTS (catalog)
-- ==========================================
CREATE TABLE IF NOT EXISTS quests (
    id VARCHAR(100) PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]+$'),
    title VARCHAR(150) NOT NULL,
    subtitle TEXT NOT NULL,
    category quest_category_enum NOT NULL,
    aura_reward INT NOT NULL CHECK (aura_reward BETWEEN 0 AND 5000),
    stat_reward_stat VARCHAR(10) NOT NULL CHECK (stat_reward_stat IN ('str', 'agi', 'end', 'rec')),
    stat_reward_amount INT NOT NULL CHECK (stat_reward_amount >= 0),
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    difficulty quest_difficulty_enum NOT NULL DEFAULT 'CASUAL',
    target_count INT NOT NULL CHECK (target_count > 0),
    unit VARCHAR(30) NOT NULL,
    icon VARCHAR(10) NOT NULL,
    accent_color VARCHAR(7) CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 7. USER QUEST COMPLETION LEDGER
-- ==========================================
CREATE TABLE IF NOT EXISTS user_quest_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    quest_id VARCHAR(100) NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    -- Upper bound mirrors MAX_AURA_PER_SYNC in packages/shared/src/sync.ts.
    aura_earned INT NOT NULL CHECK (aura_earned BETWEEN 0 AND 5000),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_key DATE NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT unique_daily_quest_per_user UNIQUE (user_id, quest_id, date_key)
);

-- ==========================================
-- 8. WORKOUT DROPS (CREATOR UPLOADS)
-- ==========================================
CREATE TABLE IF NOT EXISTS workout_drops (
    id VARCHAR(100) PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]+$'),
    title VARCHAR(150) NOT NULL,
    tagline TEXT,
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vibe_tag VARCHAR(50) NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    calories_burn_estimate INT NOT NULL CHECK (calories_burn_estimate >= 0),
    aura_multiplier NUMERIC(3, 1) NOT NULL DEFAULT 1.0 CHECK (aura_multiplier BETWEEN 1.0 AND 3.0),
    xp_points INT NOT NULL DEFAULT 100 CHECK (xp_points >= 0),
    difficulty workout_difficulty_enum NOT NULL DEFAULT 'NOVICE',
    category workout_category_enum NOT NULL DEFAULT 'STRENGTH',
    -- Engagement counters are maintained server-side only.
    likes_count INT NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    completions_count INT NOT NULL DEFAULT 0 CHECK (completions_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 9. INDEXES (FK columns + leaderboard sorts)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_profiles_squad_id ON profiles (squad_id);
CREATE INDEX IF NOT EXISTS idx_profiles_gym_id ON profiles (gym_id);
CREATE INDEX IF NOT EXISTS idx_profiles_aura_points ON profiles (aura_points DESC);
CREATE INDEX IF NOT EXISTS idx_squads_leader_id ON squads (leader_id);
CREATE INDEX IF NOT EXISTS idx_squads_total_aura ON squads (total_aura DESC);
-- user_quest_logs(user_id) is covered by the unique (user_id, quest_id, date_key) index.
CREATE INDEX IF NOT EXISTS idx_user_quest_logs_quest_id ON user_quest_logs (quest_id);
CREATE INDEX IF NOT EXISTS idx_workout_drops_creator_id ON workout_drops (creator_id);
CREATE INDEX IF NOT EXISTS idx_gym_leaderboard_total_aura ON gym_leaderboard (total_aura_earned DESC);

-- ==========================================
-- 10. TRIGGERS
-- ==========================================
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_rank ON profiles;
CREATE TRIGGER trg_profiles_rank BEFORE INSERT OR UPDATE OF aura_points, rank ON profiles
    FOR EACH ROW EXECUTE FUNCTION sync_profile_rank();

DROP TRIGGER IF EXISTS trg_squads_updated_at ON squads;
CREATE TRIGGER trg_squads_updated_at BEFORE UPDATE ON squads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_quests_updated_at ON quests;
CREATE TRIGGER trg_quests_updated_at BEFORE UPDATE ON quests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_workout_drops_updated_at ON workout_drops;
CREATE TRIGGER trg_workout_drops_updated_at BEFORE UPDATE ON workout_drops
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_gym_leaderboard_updated_at ON gym_leaderboard;
CREATE TRIGGER trg_gym_leaderboard_updated_at BEFORE UPDATE ON gym_leaderboard
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ==========================================
-- 11. RBAC HELPERS
-- ==========================================
-- SECURITY DEFINER so policies can look up the caller's role without recursing
-- through the profiles RLS policies.
CREATE OR REPLACE FUNCTION current_profile_role()
RETURNS user_role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE auth_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION current_profile_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_profile_role() TO authenticated;

-- ==========================================
-- 12. COLUMN-LEVEL PRIVILEGES
-- ==========================================
-- RLS restricts *rows*; these grants restrict *columns* so a user editing their own
-- profile cannot self-promote (role) or self-award aura/stats/rank/streaks.
REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT INSERT (auth_id, username, handle, avatar_url, title, bio) ON profiles TO authenticated;
GRANT UPDATE (username, avatar_url, title, bio) ON profiles TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON workout_drops FROM anon, authenticated;
GRANT INSERT (id, title, tagline, creator_id, vibe_tag, duration_minutes, calories_burn_estimate,
              aura_multiplier, xp_points, difficulty, category) ON workout_drops TO authenticated;
GRANT UPDATE (title, tagline, vibe_tag, duration_minutes, calories_burn_estimate,
              aura_multiplier, xp_points, difficulty, category) ON workout_drops TO authenticated;
GRANT DELETE ON workout_drops TO authenticated;

-- Server-managed tables: read-only for clients.
REVOKE INSERT, UPDATE, DELETE ON squads, quests, user_quest_logs, gym_leaderboard FROM anon, authenticated;

-- ==========================================
-- 13. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quest_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_leaderboard ENABLE ROW LEVEL SECURITY;

-- Profiles: public read; users create/update their own row (cosmetic columns only,
-- see grants above); admins may update any row.
DROP POLICY IF EXISTS "Public profiles are readable by everyone" ON profiles;
CREATE POLICY "Public profiles are readable by everyone" ON profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own profile" ON profiles;
CREATE POLICY "Users can create their own profile" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = auth_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = auth_id)
    WITH CHECK ((SELECT auth.uid()) = auth_id);

DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile" ON profiles
    FOR UPDATE TO authenticated
    USING ((SELECT current_profile_role()) = 'ADMIN')
    WITH CHECK ((SELECT current_profile_role()) = 'ADMIN');

-- Squads: public read (squad leaderboard). Writes are server-side.
DROP POLICY IF EXISTS "Squads readable by everyone" ON squads;
CREATE POLICY "Squads readable by everyone" ON squads
    FOR SELECT USING (true);

-- Quest catalog: public read. Writes are server-side.
DROP POLICY IF EXISTS "Quests readable by everyone" ON quests;
CREATE POLICY "Quests readable by everyone" ON quests
    FOR SELECT USING (true);

-- Quest logs: a user can read only their own history; admins can read all
-- (anti-cheat audits). Inserts go through the validated server sync path
-- (service_role) so clients cannot self-award aura.
-- (Previously a policy named "Quests readable by everyone" exposed every user's
-- logs publicly, and clients could insert arbitrary aura_earned values.)
DROP POLICY IF EXISTS "Quests readable by everyone" ON user_quest_logs;
DROP POLICY IF EXISTS "Users can insert their own quest logs" ON user_quest_logs;
DROP POLICY IF EXISTS "Users can read their own quest logs" ON user_quest_logs;
CREATE POLICY "Users can read their own quest logs" ON user_quest_logs
    FOR SELECT TO authenticated
    USING (
        user_id IN (SELECT id FROM profiles WHERE auth_id = (SELECT auth.uid()))
        OR (SELECT current_profile_role()) = 'ADMIN'
    );

-- Workout drops: public read; creators/admins publish and manage their own drops.
DROP POLICY IF EXISTS "Workout drops readable by everyone" ON workout_drops;
CREATE POLICY "Workout drops readable by everyone" ON workout_drops
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Creators can publish workout drops" ON workout_drops;
CREATE POLICY "Creators can publish workout drops" ON workout_drops
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = creator_id
              AND profiles.auth_id = (SELECT auth.uid())
              AND profiles.role IN ('CREATOR', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS "Creators can update their own workout drops" ON workout_drops;
CREATE POLICY "Creators can update their own workout drops" ON workout_drops
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = creator_id
              AND profiles.auth_id = (SELECT auth.uid())
              AND profiles.role IN ('CREATOR', 'ADMIN')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = creator_id
              AND profiles.auth_id = (SELECT auth.uid())
              AND profiles.role IN ('CREATOR', 'ADMIN')
        )
    );

DROP POLICY IF EXISTS "Creators can delete their own workout drops; admins any" ON workout_drops;
CREATE POLICY "Creators can delete their own workout drops; admins any" ON workout_drops
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = creator_id
              AND profiles.auth_id = (SELECT auth.uid())
        )
        OR (SELECT current_profile_role()) = 'ADMIN'
    );

-- Gym leaderboard: public read. Writes are server-side.
DROP POLICY IF EXISTS "Gym leaderboard readable by everyone" ON gym_leaderboard;
CREATE POLICY "Gym leaderboard readable by everyone" ON gym_leaderboard
    FOR SELECT USING (true);
