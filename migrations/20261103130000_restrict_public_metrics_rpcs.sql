BEGIN;

-- These counters are called only by server actions/route handlers. Public
-- callers bypass application rate limiting and can manipulate marketplace
-- ranking metrics by replaying SECURITY DEFINER RPCs directly.
CREATE OR REPLACE FUNCTION public.increment_marketplace_view(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  IF p_entity_type = 'produto' THEN
    UPDATE public.products
    SET views_count = views_count + 1,
        views_last_30_days = views_last_30_days + 1,
        marketplace_score = public.calc_product_marketplace_score(
          sales_last_30_days,
          views_last_30_days + 1,
          favorites_count,
          created_at,
          rating
        )
    WHERE id = p_entity_id
      AND is_active = true
      AND status = 'ativo'
      AND moderation_status = 'approved'
      AND show_in_marketplace = true
      AND deleted_at IS NULL;
  ELSIF p_entity_type = 'servico' THEN
    UPDATE public.services
    SET views_count = views_count + 1,
        marketplace_score = public.calc_service_marketplace_score(
          bookings_last_30_days,
          views_count + 1,
          favorites_count,
          created_at,
          rating
        )
    WHERE id = p_entity_id
      AND is_active = true
      AND show_in_marketplace = true
      AND deleted_at IS NULL;
  ELSIF p_entity_type = 'plano' THEN
    UPDATE public.recurring_plans
    SET views_count = views_count + 1,
        marketplace_score = public.calc_plan_marketplace_score(
          signups_last_30_days,
          views_count + 1,
          favorites_count,
          created_at,
          0
        )
    WHERE id = p_entity_id
      AND status = 'active'
      AND show_in_marketplace = true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_collection_views(p_collection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.collections
  SET views_count = views_count + 1
  WHERE id = p_collection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_community_video_views(p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.community_videos
  SET views_count = views_count + 1
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
  SET clicks_count = clicks_count + 1
  WHERE id = p_video_id
    AND moderation_status = 'approved';
END;
$$;

-- The singular ad impression RPC is legacy; current tracking uses the
-- service-only batched increment_ad_impressions(uuid[]) function.
REVOKE ALL ON FUNCTION public.increment_marketplace_view(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_collection_views(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_community_video_views(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_community_video_clicks(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_ad_click(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_ad_impression(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_marketplace_view(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_collection_views(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_video_views(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_community_video_clicks(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ad_impression(uuid) TO service_role;

COMMIT;
