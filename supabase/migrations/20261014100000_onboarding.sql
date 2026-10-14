-- AuraFit onboarding (applies on top of 20261014090000_starter_library.sql).
--
--   1. Enums public.fitness_goal_enum / public.fitness_level_enum
--      (mirror FITNESS_GOALS / FITNESS_LEVELS in packages/shared/src/onboarding.ts).
--   2. profiles.onboarded_at (timestamptz, NULL = not onboarded). Rows that already exist when
--      this column is first added are backfilled to now(), so current users are not forced
--      through onboarding. New sign-ups (handle_new_user trigger) start with NULL.
--   3. profiles.fitness_goal / profiles.fitness_level (nullable).
--   4. Privileges: anon/authenticated may SELECT the three new columns (non-sensitive). They may
--      NOT update them: the Next.js server writes them with the secret key (PATCH /api/v1/me),
--      which is the only writer of onboarded_at.
--
-- Idempotent: safe to re-run. Re-running never re-backfills onboarded_at (the backfill only
-- happens in the same statement block that adds the column), so users who signed up after the
-- first run keep onboarded_at = NULL. Do not edit after it has been applied; add a new migration.

-- ==========================================
-- 1. ENUMS
-- ==========================================
DO $$ BEGIN
    CREATE TYPE public.fitness_goal_enum AS ENUM ('BUILD_STRENGTH', 'LOSE_WEIGHT', 'GET_FIT', 'BUILD_HABIT', 'MOBILITY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.fitness_level_enum AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- 2. onboarded_at + one-time backfill of existing users
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'onboarded_at'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN onboarded_at TIMESTAMPTZ;
        -- Everyone who exists right now is an established user: mark them onboarded.
        UPDATE public.profiles SET onboarded_at = NOW() WHERE onboarded_at IS NULL;
    END IF;
END $$;

-- ==========================================
-- 3. GOAL / LEVEL
-- ==========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fitness_goal public.fitness_goal_enum;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fitness_level public.fitness_level_enum;

COMMENT ON COLUMN public.profiles.onboarded_at IS 'When the user finished onboarding (NULL = not yet). Server-written only (PATCH /api/v1/me).';
COMMENT ON COLUMN public.profiles.fitness_goal IS 'Onboarding answer; server-written only (PATCH /api/v1/me).';
COMMENT ON COLUMN public.profiles.fitness_level IS 'Onboarding answer; server-written only (PATCH /api/v1/me).';

-- ==========================================
-- 4. PRIVILEGES
-- ==========================================
-- profiles uses column-level SELECT (20261013130000_launch_hardening.sql): new columns are not
-- readable by API roles until granted explicitly. These three are harmless to expose.
GRANT SELECT (fitness_goal, fitness_level, onboarded_at) ON public.profiles TO anon, authenticated;
-- Never client-writable (no-op unless someone granted them; keeps re-runs strict).
REVOKE INSERT (fitness_goal, fitness_level, onboarded_at) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (fitness_goal, fitness_level, onboarded_at) ON public.profiles FROM anon, authenticated;
