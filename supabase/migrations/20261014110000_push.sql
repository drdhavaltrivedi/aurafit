-- AuraFit streak-saver push notifications.
--
--   1. public.notification_settings  per-user timezone + preferences (1 row per profile)
--   2. public.push_tokens            Expo push tokens (globally unique; a device moves with its token)
--   3. public.notification_log       one row per (user, kind, local date): idempotency ledger
--   4. public.push_tickets           Expo push ticket ids awaiting a receipt check
--   5. RLS on, NO client access: anon/authenticated have no privileges; everything goes
--      through /api/v1/* (secret key, service_role) or the cron route.
--   6. private.due_notification_recipients(kind, now)  recipient selection (pure, read-only)
--      public.claim_due_notifications(kind, now)      selection + ledger insert (service_role only)
--      public.release_notification_claims(...)        undo claims whose send failed (service_role only)
--   7. Scheduler: pg_cron (hourly, minute 0) -> private.dispatch_notifications_cron() -> pg_net
--      POST ${aurafit_app_url}/api/cron/notifications with Bearer ${aurafit_cron_secret}
--      (both read from Supabase Vault at run time), plus a daily prune job.
--
-- profiles.last_active_date semantics (see complete_quest / complete_workout): it is the UTC
-- calendar date (date_key = utcDateKey() on the server) of the last quest/workout, and the
-- streak rule compares UTC dates. The streak therefore really "ends" at UTC midnight after the
-- day following last_active_date, not at the user's local midnight. Recipient selection is
-- deliberately conservative so a push is never false:
--   * at risk      = last_active_date < current UTC date (nothing logged for the current UTC day)
--   * still alive  = last_active_date >= UTC today - 1, or = UTC today - 2 with a shield left
--                    (otherwise the streak is already lost and "keeps it alive" would be a lie)
--   * not trained  = no quest/workout completed_at since the user's LOCAL midnight (exact
--                    timestamps from the ledgers, so someone who trained this local day is
--                    never nagged even if that activity was filed under another UTC date).
-- The trade-off: a user far from UTC can occasionally miss a nudge they would have needed
-- (e.g. trained at 08:00 in UTC+9, which is filed under yesterday's UTC date). Moving streaks
-- to local dates would remove the mismatch; that is a change to the streak engine, not here.
--
-- Idempotent: safe to re-run. Do not edit after it has been applied; add a new migration
-- (then run `npm run db:sync`).

-- ==========================================
-- 1-4. TABLES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- IANA name, validated with Intl by the API; unknown-to-Postgres names are skipped at send time.
    timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64),
    streak_saver BOOLEAN NOT NULL DEFAULT true,
    daily_reminder_hour SMALLINT CHECK (daily_reminder_hour BETWEEN 0 AND 23),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE
        CHECK (char_length(token) <= 200 AND token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'),
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);

-- The primary key IS the idempotency key: UNIQUE (user_id, kind, local_date).
CREATE TABLE IF NOT EXISTS public.notification_log (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('STREAK_SAVER', 'DAILY_REMINDER')),
    local_date DATE NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_log_pkey PRIMARY KEY (user_id, kind, local_date)
);
CREATE INDEX IF NOT EXISTS idx_notification_log_local_date ON public.notification_log (local_date);

-- Expo returns a ticket per message; the receipt (incl. DeviceNotRegistered) is fetched
-- >= 15 minutes later by the next cron run. No FK: the token may be gone by then.
CREATE TABLE IF NOT EXISTS public.push_tickets (
    ticket_id TEXT PRIMARY KEY CHECK (char_length(ticket_id) BETWEEN 1 AND 100),
    token TEXT NOT NULL CHECK (char_length(token) <= 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tickets_created_at ON public.push_tickets (created_at);

-- ==========================================
-- 5. PRIVILEGES + RLS (server-only tables)
-- ==========================================
-- Supabase default privileges grant ALL on new public tables to anon/authenticated.
-- Revoke them: clients never touch these tables directly (Data API returns permission denied).
REVOKE ALL ON public.notification_settings, public.push_tokens, public.notification_log, public.push_tickets
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.notification_settings, public.push_tokens, public.notification_log, public.push_tickets
    TO service_role;

-- RLS on with no policies = deny-all for every non-BYPASSRLS role (defence in depth if a
-- grant is ever re-added by accident). service_role bypasses RLS.
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tickets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 6. RECIPIENT SELECTION
-- ==========================================
-- Users due for `p_kind` at instant `p_now`. Requires a notification_settings row (the
-- timezone is never guessed), >= 1 push token, a timezone Postgres knows, the local hour
-- equal to the target hour (20 for STREAK_SAVER, daily_reminder_hour for DAILY_REMINDER),
-- no ledger row for that kind on the local date, and no quest/workout since local midnight.
-- DAILY_REMINDER additionally skips users who already got a STREAK_SAVER that local day.
-- Zones with :30/:45 offsets match at the cron's minute 0 (e.g. 20:30 in Asia/Kolkata).
CREATE OR REPLACE FUNCTION private.due_notification_recipients(p_kind TEXT, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (user_id UUID, local_date DATE, streak_days INT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH valid AS MATERIALIZED (
        -- Materialized so AT TIME ZONE below never sees a zone Postgres would reject.
        SELECT ns.user_id, ns.timezone, ns.streak_saver, ns.daily_reminder_hour
        FROM public.notification_settings ns
        WHERE ns.timezone IN (SELECT tz.name FROM pg_catalog.pg_timezone_names tz)
          AND EXISTS (SELECT 1 FROM public.push_tokens t WHERE t.user_id = ns.user_id)
    ),
    loc AS (
        SELECT v.*, (p_now AT TIME ZONE v.timezone) AS local_ts
        FROM valid v
    ),
    cand AS (
        SELECT l.user_id, l.streak_saver, l.daily_reminder_hour,
               l.local_ts::date AS local_date,
               extract(hour FROM l.local_ts)::int AS local_hour,
               (date_trunc('day', l.local_ts) AT TIME ZONE l.timezone) AS local_midnight
        FROM loc l
    )
    SELECT c.user_id, c.local_date, p.streak_days
    FROM cand c
    JOIN public.profiles p ON p.id = c.user_id
    CROSS JOIN LATERAL (SELECT (p_now AT TIME ZONE 'UTC')::date AS utc_today) u
    WHERE p_kind IN ('STREAK_SAVER', 'DAILY_REMINDER')
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_log n
          WHERE n.user_id = c.user_id AND n.kind = p_kind AND n.local_date = c.local_date)
      AND NOT EXISTS (
          SELECT 1 FROM public.user_quest_logs q
          WHERE q.user_id = c.user_id AND q.completed_at >= c.local_midnight)
      AND NOT EXISTS (
          SELECT 1 FROM public.user_workout_logs w
          WHERE w.user_id = c.user_id AND w.completed_at >= c.local_midnight)
      AND (
          (p_kind = 'STREAK_SAVER'
              AND c.streak_saver
              AND c.local_hour = 20 -- STREAK_SAVER_LOCAL_HOUR in packages/shared/src/notifications.ts
              AND p.streak_days > 0
              AND p.last_active_date IS NOT NULL
              AND p.last_active_date < u.utc_today
              AND (p.last_active_date >= u.utc_today - 1
                   OR (p.last_active_date = u.utc_today - 2 AND p.streak_shields > 0)))
          OR
          (p_kind = 'DAILY_REMINDER'
              AND c.daily_reminder_hour IS NOT NULL
              AND c.local_hour = c.daily_reminder_hour
              AND NOT EXISTS (
                  SELECT 1 FROM public.notification_log n2
                  WHERE n2.user_id = c.user_id AND n2.kind = 'STREAK_SAVER' AND n2.local_date = c.local_date))
      );
$$;

-- Selects due recipients AND records them in notification_log in one statement
-- (INSERT ... ON CONFLICT DO NOTHING), returning only the rows this call inserted, with
-- their tokens. A second run for the same hour (or a concurrent one) claims nobody twice.
-- Called by the cron route with the secret key via supabase-js .rpc(); SECURITY INVOKER
-- and EXECUTE granted to service_role only (same model as public.complete_quest).
CREATE OR REPLACE FUNCTION public.claim_due_notifications(p_kind TEXT, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (user_id UUID, local_date DATE, streak_days INT, tokens TEXT[])
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF p_kind IS NULL OR p_kind NOT IN ('STREAK_SAVER', 'DAILY_REMINDER') THEN
        RAISE EXCEPTION 'unknown notification kind %', p_kind USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN QUERY
    WITH due AS (
        SELECT d.user_id AS uid, d.local_date AS ldate, d.streak_days AS streak
        FROM private.due_notification_recipients(p_kind, coalesce(p_now, NOW())) d
    ),
    claimed AS (
        INSERT INTO public.notification_log AS nl (user_id, kind, local_date)
        SELECT due.uid, p_kind, due.ldate FROM due
        ON CONFLICT ON CONSTRAINT notification_log_pkey DO NOTHING
        RETURNING nl.user_id AS uid, nl.local_date AS ldate
    )
    SELECT c.uid, c.ldate, due.streak, array_agg(t.token ORDER BY t.token)
    FROM claimed c
    JOIN due ON due.uid = c.uid
    JOIN public.push_tokens t ON t.user_id = c.uid
    GROUP BY c.uid, c.ldate, due.streak;
END;
$$;

-- Deletes ledger rows for claims whose push could not be handed to Expo at all (network /
-- 5xx), so re-running the job within the same hour retries them.
CREATE OR REPLACE FUNCTION public.release_notification_claims(p_kind TEXT, p_user_ids UUID[], p_local_dates DATE[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM public.notification_log nl
    USING unnest(p_user_ids, p_local_dates) AS r(uid, ldate)
    WHERE nl.kind = p_kind AND nl.user_id = r.uid AND nl.local_date = r.ldate;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Housekeeping: the ledger only needs the current local day; keep 30 days for support.
CREATE OR REPLACE FUNCTION private.prune_notification_data()
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
    DELETE FROM public.notification_log WHERE local_date < (NOW() AT TIME ZONE 'UTC')::date - 30;
    DELETE FROM public.push_tickets WHERE created_at < NOW() - INTERVAL '2 days';
$$;

-- ==========================================
-- 7. SCHEDULER (pg_cron -> pg_net -> Vercel)
-- ==========================================
-- Reads the target URL and bearer secret from Supabase Vault at run time (never stored in
-- the migration or the cron command). Missing vault/pg_net/secrets: warns and does nothing.
-- Requires https:// so the secret is never sent in clear text.
-- Run by the pg_cron job owner (postgres); not callable by API roles.
CREATE OR REPLACE FUNCTION private.dispatch_notifications_cron()
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_request_id BIGINT;
BEGIN
    IF to_regclass('vault.decrypted_secrets') IS NULL THEN
        RAISE WARNING 'aurafit notifications: Supabase Vault is not available';
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'net' AND p.proname = 'http_post'
    ) THEN
        RAISE WARNING 'aurafit notifications: pg_net is not installed';
        RETURN NULL;
    END IF;

    EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aurafit_app_url' LIMIT 1$q$ INTO v_url;
    EXECUTE $q$SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aurafit_cron_secret' LIMIT 1$q$ INTO v_secret;
    v_url := rtrim(btrim(coalesce(v_url, '')), '/');
    v_secret := btrim(coalesce(v_secret, ''));
    IF v_url !~ '^https://[^/\s]+' OR v_secret = '' THEN
        RAISE WARNING 'aurafit notifications: vault secrets aurafit_app_url (https://...) and aurafit_cron_secret must be set';
        RETURN NULL;
    END IF;

    EXECUTE $q$
        SELECT net.http_post(
            url := $1,
            body := jsonb_build_object('scheduledAt', now()),
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || $2),
            timeout_milliseconds := 60000
        )
    $q$ INTO v_request_id USING v_url || '/api/cron/notifications', v_secret;
    RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.due_notification_recipients(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prune_notification_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.dispatch_notifications_cron() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_due_notifications(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_notification_claims(TEXT, UUID[], DATE[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.due_notification_recipients(TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION private.prune_notification_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_due_notifications(TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_notification_claims(TEXT, UUID[], DATE[]) TO service_role;

-- Jobs. Guarded so the migration also applies where the extensions are unavailable (PGlite
-- tests). Supabase installs pg_cron into pg_catalog and pg_net into the `extensions` schema
-- (it creates its own `net` schema for its functions). cron.schedule() with an existing job
-- name overwrites that job, so re-running is safe. pg_cron schedules run in UTC.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron is not available; notification jobs not scheduled';
        RETURN;
    END IF;
    -- Only create when missing: on Supabase, CREATE EXTENSION fires an event trigger that
    -- re-grants cron schema privileges and fails ("dependent privileges exist") if pg_cron exists.
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog;
    END IF;

    PERFORM cron.schedule(
        'aurafit-notification-prune',
        '20 3 * * *', -- daily 03:20 UTC
        'SELECT private.prune_notification_data()'
    );

    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            CREATE SCHEMA IF NOT EXISTS extensions;
            CREATE EXTENSION pg_net WITH SCHEMA extensions;
        END IF;
        PERFORM cron.schedule(
            'aurafit-hourly-notifications',
            '0 * * * *', -- every hour at minute 0 (UTC)
            'SELECT private.dispatch_notifications_cron()'
        );
    ELSE
        RAISE NOTICE 'pg_net is not available; hourly notification job not scheduled';
    END IF;
END $$;
