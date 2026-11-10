-- Migration: Add last 30 days metrics to community_videos
-- ============================================================================

ALTER TABLE public.community_videos
  ADD COLUMN IF NOT EXISTS views_last_30_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_last_30_days INTEGER NOT NULL DEFAULT 0;

UPDATE public.community_videos
SET views_last_30_days = views_count,
    clicks_last_30_days = clicks_count
WHERE created_at >= now() - interval '30 days';

CREATE OR REPLACE FUNCTION public.increment_community_video_views(p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.community_videos
  SET views_count = views_count + 1,
      views_last_30_days = views_last_30_days + 1
  WHERE id = p_video_id
    AND moderation_status = 'approved';
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_community_video_clicks(p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.community_videos
  SET clicks_count = clicks_count + 1,
      clicks_last_30_days = clicks_last_30_days + 1
  WHERE id = p_video_id
    AND moderation_status = 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.increment_community_video_views(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_community_video_clicks(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_community_video_views(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_video_clicks(uuid) TO service_role;
