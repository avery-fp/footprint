-- 008_aro_rate_limit_functions.sql
-- Portable definitions for ARO rate-limiting functions
-- Extracted from Supabase production (public schema)

CREATE OR REPLACE FUNCTION public.aro_reset_daily_counters()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE aro_platform_state
    SET daily_posts_today = 0,
        daily_posts_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE daily_posts_date < CURRENT_DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.aro_can_post(p_platform character varying, p_daily_cap integer DEFAULT 50)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  state aro_platform_state%ROWTYPE;
BEGIN
  PERFORM aro_reset_daily_counters();
  SELECT * INTO state FROM aro_platform_state WHERE platform = p_platform;
  IF NOT FOUND OR NOT state.enabled THEN
    RETURN FALSE;
  END IF;
  IF state.cooldown_until IS NOT NULL AND state.cooldown_until > NOW() THEN
    RETURN FALSE;
  END IF;
  IF state.daily_posts_today >= p_daily_cap THEN
    RETURN FALSE;
  END IF;
  IF state.consecutive_errors >= 5 THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$function$;
