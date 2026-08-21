-- ============================================================================
-- Migration: Cleanup address_coordinates_cache
-- Created: 2026-08-21
-- Description:
--   - Drops the unused `provider` column (always 'nominatim')
--   - Adds `last_accessed_at` to track usage for TTL cleanup
--   - Creates a purge function + pg_cron job (90-day retention)
--   Idempotent: safe to run multiple times.
-- ============================================================================

-- Drop unused provider column
ALTER TABLE public.address_coordinates_cache
  DROP COLUMN IF EXISTS provider;

-- Add usage tracking column
ALTER TABLE public.address_coordinates_cache
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE public.address_coordinates_cache
SET last_accessed_at = updated_at
WHERE last_accessed_at = now();

-- Purge function
CREATE OR REPLACE FUNCTION purge_stale_address_coordinates_cache(p_retention_days int DEFAULT 90)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE deleted_count int;
BEGIN
  DELETE FROM public.address_coordinates_cache
  WHERE last_accessed_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- pg_cron job (only if pg_cron is available)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip scheduling purge_stale_address_coordinates_cache';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-stale-address-coordinates') THEN
    PERFORM cron.unschedule('cleanup-stale-address-coordinates');
  END IF;

  PERFORM cron.schedule(
    'cleanup-stale-address-coordinates',
    '0 4 * * 0',
    $cmd$SELECT purge_stale_address_coordinates_cache(90)$cmd$
  );
END; $$;

COMMENT ON FUNCTION public.purge_stale_address_coordinates_cache(int) IS
  'Removes geocoding cache entries not accessed for p_retention_days. Weekly pg_cron job.';
