-- AuraFit Production PostgreSQL / Supabase Database Schema
-- Includes Row Level Security (RLS) policies and Role-Based Access Control (RBAC)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUMS
CREATE TYPE user_role_enum AS ENUM ('MEMBER', 'CREATOR', 'ADMIN');
CREATE TYPE hunter_rank_enum AS ENUM ('E-RANK', 'D-RANK', 'C-RANK', 'B-RANK', 'A-RANK', 'S-RANK', 'MONARCH');
CREATE TYPE quest_category_enum AS ENUM ('DAILY_QUEST', 'BOSS_RAID', 'MOVEMENT_SNACK', 'SQUAD_MISSION');
CREATE TYPE quest_difficulty_enum AS ENUM ('CASUAL', 'HARD', 'NIGHTMARE', 'EXTREME');

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE, -- linked to Supabase / Firebase auth user
    username VARCHAR(50) NOT NULL,
    handle VARCHAR(50) NOT NULL UNIQUE,
    role user_role_enum NOT NULL DEFAULT 'MEMBER',
    avatar_url TEXT,
    title VARCHAR(100) DEFAULT 'Hunter in Training',
    bio TEXT,
    aura_points BIGINT NOT NULL DEFAULT 0,
    rank hunter_rank_enum NOT NULL DEFAULT 'E-RANK',
    level INT NOT NULL DEFAULT 1,
    str_stat INT NOT NULL DEFAULT 50,
    agi_stat INT NOT NULL DEFAULT 50,
    end_stat INT NOT NULL DEFAULT 50,
    rec_stat INT NOT NULL DEFAULT 50,
    streak_days INT NOT NULL DEFAULT 0,
    streak_shields INT NOT NULL DEFAULT 2,
    squad_id UUID,
    gym_id UUID,
    total_workouts INT NOT NULL DEFAULT 0,
    weekly_aura_gained BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SQUADS TABLE
CREATE TABLE IF NOT EXISTS squads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    tag VARCHAR(20) NOT NULL UNIQUE,
    avatar TEXT DEFAULT '⚔️',
    total_aura BIGINT NOT NULL DEFAULT 0,
    leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    member_count INT NOT NULL DEFAULT 1,
    max_members INT NOT NULL DEFAULT 5,
    streak_days INT NOT NULL DEFAULT 0,
    weekly_goal_progress INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. QUESTS TABLE
CREATE TABLE IF NOT EXISTS quests (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    subtitle TEXT NOT NULL,
    category quest_category_enum NOT NULL,
    aura_reward INT NOT NULL,
    stat_reward_stat VARCHAR(10) NOT NULL,
    stat_reward_amount INT NOT NULL,
    duration_minutes INT NOT NULL,
    difficulty quest_difficulty_enum NOT NULL DEFAULT 'CASUAL',
    target_count INT NOT NULL,
    unit VARCHAR(30) NOT NULL,
    icon VARCHAR(10) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. USER COMPLETED QUESTS
CREATE TABLE IF NOT EXISTS user_quest_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    quest_id VARCHAR(100) NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    aura_earned INT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_key DATE NOT NULL DEFAULT CURRENT_DATE,
    CONSTRAINT unique_daily_quest_per_user UNIQUE (user_id, quest_id, date_key)
);

-- 6. WORKOUT DROPS TABLE (CREATOR UPLOADS)
CREATE TABLE IF NOT EXISTS workout_drops (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    tagline TEXT,
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    vibe_tag VARCHAR(50) NOT NULL,
    duration_minutes INT NOT NULL,
    calories_burn_estimate INT NOT NULL,
    aura_multiplier NUMERIC(3, 1) NOT NULL DEFAULT 1.0,
    xp_points INT NOT NULL DEFAULT 100,
    difficulty VARCHAR(30) NOT NULL DEFAULT 'NOVICE',
    category VARCHAR(50) NOT NULL DEFAULT 'STRENGTH',
    likes_count INT NOT NULL DEFAULT 0,
    completions_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. GYM LEADERBOARD TABLE
CREATE TABLE IF NOT EXISTS gym_leaderboard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_name VARCHAR(150) NOT NULL UNIQUE,
    city VARCHAR(100) NOT NULL,
    active_squads INT NOT NULL DEFAULT 0,
    total_aura_earned BIGINT NOT NULL DEFAULT 0,
    top_hunter_handle VARCHAR(50),
    growth_rate VARCHAR(50) DEFAULT '+0%',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quest_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE squads ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read, User can update own profile, Admins can update all
CREATE POLICY "Public profiles are readable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = auth_id);

-- Quests: Public read
CREATE POLICY "Quests readable by everyone" ON user_quest_logs
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own quest logs" ON user_quest_logs
    FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_id FROM profiles WHERE id = user_id));

-- Workout drops: Public read, Creators can insert
CREATE POLICY "Workout drops readable by everyone" ON workout_drops
    FOR SELECT USING (true);

CREATE POLICY "Creators can publish workout drops" ON workout_drops
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = creator_id 
            AND profiles.auth_id = auth.uid() 
            AND profiles.role IN ('CREATOR', 'ADMIN')
        )
    );
