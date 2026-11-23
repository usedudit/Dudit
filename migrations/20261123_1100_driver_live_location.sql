-- ============================================================================
-- Migration: 20261123_1100_driver_live_location.sql
-- Descrição (Fase 1a — Presença e localização em tempo real do entregador):
--   1. Cria tabela public.delivery_driver_locations com RLS ENABLE + FORCE
--      (leitura apenas pelo próprio entregador e parceiros vinculados;
--       escrita somente via RPC SECURITY DEFINER / service_role).
--   2. Cria view única de verdade public.delivery_driver_presence.
--   3. Cria RPC public.upsert_my_driver_location(...) SECURITY DEFINER.
--   4. Atualiza public.get_my_delivery_dashboard() para retornar
--      position_quality, location_source e located_at.
-- ============================================================================

-- 1. Tabela de última posição conhecida do entregador
CREATE TABLE IF NOT EXISTS public.delivery_driver_locations (
  driver_id    uuid PRIMARY KEY REFERENCES public.delivery_drivers(user_id) ON DELETE CASCADE,
  latitude     numeric(10,7) NOT NULL,
  longitude    numeric(10,7) NOT NULL,
  accuracy_m   numeric(8,2),
  heading_deg  numeric(6,2),
  speed_kmh    numeric(6,2),
  source       text NOT NULL DEFAULT 'gps'
                 CHECK (source IN ('gps','network','address_fallback')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_driver_locations_fresh_idx
  ON public.delivery_driver_locations (updated_at DESC);

CREATE INDEX IF NOT EXISTS delivery_driver_locations_coords_idx
  ON public.delivery_driver_locations (latitude, longitude);

ALTER TABLE public.delivery_driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_locations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_driver_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_driver_locations TO authenticated;
GRANT ALL ON TABLE public.delivery_driver_locations TO service_role;

DROP POLICY IF EXISTS delivery_driver_locations_select_own ON public.delivery_driver_locations;
CREATE POLICY delivery_driver_locations_select_own
  ON public.delivery_driver_locations
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS delivery_driver_locations_select_linked_partner ON public.delivery_driver_locations;
CREATE POLICY delivery_driver_locations_select_linked_partner
  ON public.delivery_driver_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_driver_partners ddp
      JOIN public.partner_users pu
        ON pu.partner_id = ddp.partner_id
       AND pu.user_id = auth.uid()
      WHERE ddp.driver_id = delivery_driver_locations.driver_id
        AND ddp.is_active = true
    )
  );

-- 2. View única de verdade de presença e ocupação do entregador
CREATE OR REPLACE VIEW public.delivery_driver_presence
WITH (security_invoker = true) AS
SELECT
  dd.user_id,
  dd.is_active,
  dd.availability_status,
  dd.vehicle_type,
  dd.capacity_orders,
  dd.has_thermal_bag,
  dd.max_pickup_km,
  dd.reject_streak,
  dd.cooldown_until,
  COALESCE(act.active_count, 0)::integer AS active_count,
  CASE
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '2 minutes'
      THEN l.latitude
    ELSE COALESCE(a.latitude::numeric(10,7), dd.latitude)
  END AS lat,
  CASE
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '2 minutes'
      THEN l.longitude
    ELSE COALESCE(a.longitude::numeric(10,7), dd.longitude)
  END AS lng,
  COALESCE(a.city, dd.city) AS city,
  COALESCE(a.state, dd.state) AS state,
  CASE
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '2 minutes'
      THEN 'live'
    WHEN COALESCE(a.latitude, dd.latitude) IS NOT NULL
      AND COALESCE(a.longitude, dd.longitude) IS NOT NULL
      THEN 'address'
    ELSE 'unknown'
  END AS position_quality,
  l.source AS location_source,
  l.accuracy_m,
  l.updated_at AS located_at
FROM public.delivery_drivers dd
LEFT JOIN public.delivery_driver_locations l
  ON l.driver_id = dd.user_id
LEFT JOIN LATERAL (
  SELECT addr.latitude, addr.longitude, addr.city, addr.state
  FROM public.addresses addr
  WHERE addr.user_id = dd.user_id
  ORDER BY addr.is_default DESC, addr.updated_at DESC
  LIMIT 1
) a ON true
LEFT JOIN LATERAL (
  SELECT count(DISTINCT COALESCE(da.delivery_id, da.id)) AS active_count
  FROM public.delivery_assignments da
  WHERE da.driver_id = dd.user_id
    AND da.status IN ('accepted', 'picked_up', 'out_for_delivery')
) act ON true;

GRANT SELECT ON public.delivery_driver_presence TO authenticated, service_role;

-- 3. RPC SECURITY DEFINER para heartbeat de localização do entregador
CREATE OR REPLACE FUNCTION public.upsert_my_driver_location(
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_accuracy numeric DEFAULT NULL,
  p_heading numeric DEFAULT NULL,
  p_speed numeric DEFAULT NULL,
  p_source text DEFAULT 'gps'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_active boolean;
  v_fallback_lat numeric(10,7);
  v_fallback_lng numeric(10,7);
  v_final_lat numeric(10,7);
  v_final_lng numeric(10,7);
  v_source text := COALESCE(NULLIF(TRIM(p_source), ''), 'gps');
  v_now timestamptz := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_source NOT IN ('gps', 'network', 'address_fallback') THEN
    RAISE EXCEPTION 'invalid_location_source';
  END IF;

  SELECT dd.is_active, dd.latitude, dd.longitude
  INTO v_is_active, v_fallback_lat, v_fallback_lng
  FROM public.delivery_drivers dd
  WHERE dd.user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
      RAISE EXCEPTION 'invalid_coordinates';
    END IF;
    v_final_lat := ROUND(p_lat, 7);
    v_final_lng := ROUND(p_lng, 7);
  ELSIF v_source = 'address_fallback' THEN
    SELECT COALESCE(a.latitude::numeric(10,7), v_fallback_lat),
           COALESCE(a.longitude::numeric(10,7), v_fallback_lng)
    INTO v_final_lat, v_final_lng
    FROM public.addresses a
    WHERE a.user_id = v_user
      AND a.latitude IS NOT NULL
      AND a.longitude IS NOT NULL
    ORDER BY a.is_default DESC, a.updated_at DESC
    LIMIT 1;

    v_final_lat := COALESCE(v_final_lat, v_fallback_lat);
    v_final_lng := COALESCE(v_final_lng, v_fallback_lng);

    IF v_final_lat IS NULL OR v_final_lng IS NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'position_quality', 'unknown',
        'source', v_source,
        'updated_at', v_now
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_coordinates';
  END IF;

  INSERT INTO public.delivery_driver_locations (
    driver_id, latitude, longitude, accuracy_m, heading_deg, speed_kmh, source, updated_at
  ) VALUES (
    v_user,
    v_final_lat,
    v_final_lng,
    CASE WHEN p_accuracy IS NOT NULL AND p_accuracy >= 0 THEN ROUND(LEAST(p_accuracy, 999999), 2) ELSE NULL END,
    CASE WHEN p_heading IS NOT NULL AND p_heading >= 0 AND p_heading <= 360 THEN ROUND(p_heading, 2) ELSE NULL END,
    CASE WHEN p_speed IS NOT NULL AND p_speed >= 0 THEN ROUND(LEAST(p_speed, 999), 2) ELSE NULL END,
    v_source,
    v_now
  )
  ON CONFLICT (driver_id) DO UPDATE SET
    latitude    = EXCLUDED.latitude,
    longitude   = EXCLUDED.longitude,
    accuracy_m  = EXCLUDED.accuracy_m,
    heading_deg = EXCLUDED.heading_deg,
    speed_kmh   = EXCLUDED.speed_kmh,
    source      = EXCLUDED.source,
    updated_at  = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'success', true,
    'position_quality', CASE WHEN v_source IN ('gps', 'network') THEN 'live' ELSE 'address' END,
    'source', v_source,
    'updated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_driver_location(numeric, numeric, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_driver_location(numeric, numeric, numeric, numeric, numeric, text) TO authenticated;

-- 4. Atualizar get_my_delivery_dashboard para incluir qualidade da posição
CREATE OR REPLACE FUNCTION public.get_my_delivery_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_availability text;
  v_active boolean;
  v_position_quality text;
  v_location_source text;
  v_located_at timestamptz;
  v_occupied boolean;
  v_pending integer;
  v_in_progress integer;
  v_completed integer;
BEGIN
  SELECT dp.availability_status, dp.is_active, dp.position_quality, dp.location_source, dp.located_at
    INTO v_availability, v_active, v_position_quality, v_location_source, v_located_at
  FROM public.delivery_driver_presence dp
  WHERE dp.user_id = v_user;

  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  SELECT count(*) FILTER (WHERE da.status IN ('assigned', 'accepted')),
         count(*) FILTER (WHERE da.status IN ('picked_up', 'out_for_delivery')),
         count(*) FILTER (WHERE da.status = 'delivered')
    INTO v_pending, v_in_progress, v_completed
  FROM public.delivery_assignments da
  WHERE da.driver_id = v_user;

  v_occupied := v_in_progress > 0 OR v_pending > 0;

  RETURN jsonb_build_object(
    'pending', v_pending,
    'in_progress', v_in_progress,
    'completed', v_completed,
    'availability', CASE WHEN v_occupied THEN 'occupied' ELSE COALESCE(v_availability, 'offline') END,
    'position_quality', COALESCE(v_position_quality, 'unknown'),
    'location_source', v_location_source,
    'located_at', v_located_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_delivery_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_dashboard() TO authenticated;
