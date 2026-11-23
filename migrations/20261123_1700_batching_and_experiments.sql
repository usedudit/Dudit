-- ============================================================================
-- Migration: 20261123_1700_batching_and_experiments.sql
-- Descrição (Fase 3b — Batching, experimentos A/B e métricas de saúde):
--   1. Cria public.find_batch_candidate(p_assignment_id) verificando
--      detour <= batch_max_detour_min, +15% de rota, active_count < capacity
--      e mesma loja ou lojas a <= 1,5 km.
--   2. Cria public.dispatch_experiments + public.get_dispatch_experiment_variant()
--      com hash determinístico por assignment_id (A/B sem deploy).
--   3. Cria public.get_dispatch_health_metrics(p_days, p_city) para o painel
--      de saúde do despacho (/ddt-admin/entregadores/saude).
-- ============================================================================

-- 1. Função find_batch_candidate (§8.2)
CREATE OR REPLACE FUNCTION public.find_batch_candidate(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_assignment public.delivery_assignments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_store_lat numeric;
  v_store_lon numeric;
  v_max_detour_min integer := 5;
  v_circuity numeric := 1.35;
  v_hour integer := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::integer;
  v_result jsonb;
BEGIN
  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_assignment.order_id;

  SELECT COALESCE(ds.batch_max_detour_min, 5), COALESCE(ds.circuity_factor, 1.35)
  INTO v_max_detour_min, v_circuity
  FROM public.dispatch_settings ds
  WHERE (ds.store_id = v_order.store_id AND ds.partner_id = v_assignment.partner_id)
     OR (ds.store_id IS NULL AND ds.partner_id = v_assignment.partner_id)
     OR (ds.partner_id IS NULL AND ds.store_id IS NULL)
  ORDER BY
    CASE
      WHEN ds.store_id = v_order.store_id THEN 1
      WHEN ds.partner_id = v_assignment.partner_id THEN 2
      ELSE 3
    END
  LIMIT 1;

  SELECT a.latitude, a.longitude INTO v_store_lat, v_store_lon
  FROM public.addresses a
  WHERE a.store_id = v_order.store_id
     OR (v_order.store_id IS NULL AND a.partner_id = v_assignment.partner_id)
     OR a.partner_id = v_assignment.partner_id
  ORDER BY
    CASE WHEN a.store_id = v_order.store_id AND a.is_default = true THEN 1
         WHEN a.store_id = v_order.store_id THEN 2
         ELSE 3 END,
    a.created_at ASC
  LIMIT 1;

  IF v_store_lat IS NULL OR v_store_lon IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH active_drivers AS (
    SELECT DISTINCT ON (da.driver_id)
      da.driver_id,
      da.id AS active_assignment_id,
      o_act.store_id AS active_store_id,
      dp.vehicle_type,
      dp.active_count,
      dp.capacity_orders,
      sa_act.latitude AS active_store_lat,
      sa_act.longitude AS active_store_lon,
      CASE
        WHEN (o_act.delivery_breakdown->>'distanceKm') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (o_act.delivery_breakdown->>'distanceKm')::numeric > 0
        THEN (o_act.delivery_breakdown->>'distanceKm')::numeric
        ELSE 4.0
      END AS active_route_km
    FROM public.delivery_assignments da
    JOIN public.orders o_act ON o_act.id = da.order_id
    JOIN public.delivery_driver_presence dp ON dp.user_id = da.driver_id
    LEFT JOIN LATERAL (
      SELECT a.latitude, a.longitude
      FROM public.addresses a
      WHERE a.store_id = o_act.store_id OR a.partner_id = da.partner_id
      ORDER BY CASE WHEN a.store_id = o_act.store_id THEN 1 ELSE 2 END, a.created_at ASC
      LIMIT 1
    ) sa_act ON true
    WHERE da.driver_id IS NOT NULL
      AND da.status IN ('accepted', 'picked_up')
      AND da.id <> v_assignment.id
      AND dp.is_active = true
      AND dp.active_count < GREATEST(COALESCE(dp.capacity_orders, 1), 1)
      AND public.vehicle_compatible(dp.vehicle_type, v_order.package_weight_kg, v_order.package_volume_l)
    ORDER BY da.driver_id, da.accepted_at DESC
  ),
  evaluated AS (
    SELECT
      ad.driver_id,
      ad.active_assignment_id,
      ad.vehicle_type,
      ad.active_count,
      ad.capacity_orders,
      (ad.active_store_id IS NOT NULL AND ad.active_store_id = v_order.store_id) AS same_store,
      CASE
        WHEN ad.active_store_id IS NOT NULL AND ad.active_store_id = v_order.store_id THEN 0.0
        ELSE public.haversine_distance_km(ad.active_store_lat, ad.active_store_lon, v_store_lat, v_store_lon)
      END AS stores_distance_km,
      ad.active_route_km
    FROM active_drivers ad
  ),
  filtered AS (
    SELECT
      e.*,
      public.estimate_road_km(e.stores_distance_km, v_circuity) AS detour_km,
      public.estimate_travel_min(public.estimate_road_km(e.stores_distance_km, v_circuity), e.vehicle_type, v_hour) AS detour_min
    FROM evaluated e
    WHERE e.same_store
       OR (e.stores_distance_km IS NOT NULL AND e.stores_distance_km <= 1.5)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'driver_id', f.driver_id,
    'active_assignment_id', f.active_assignment_id,
    'vehicle_type', f.vehicle_type,
    'same_store', f.same_store,
    'stores_distance_km', f.stores_distance_km,
    'detour_km', f.detour_km,
    'detour_min', f.detour_min
  ) ORDER BY f.detour_min ASC, f.stores_distance_km ASC), '[]'::jsonb)
  INTO v_result
  FROM filtered f
  WHERE COALESCE(f.detour_min, 0) <= v_max_detour_min
    AND (f.same_store OR COALESCE(f.detour_km, 0) <= (f.active_route_km * 0.15));

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.find_batch_candidate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_batch_candidate(uuid) TO service_role;

-- 2. Tabela dispatch_experiments e hash determinístico por assignment_id
CREATE TABLE IF NOT EXISTS public.dispatch_experiments (
  key           text PRIMARY KEY,
  description   text,
  variant_a     jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant_b     jsonb NOT NULL DEFAULT '{}'::jsonb,
  traffic_b_pct smallint NOT NULL DEFAULT 50 CHECK (traffic_b_pct >= 0 AND traffic_b_pct <= 100),
  enabled       boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_experiments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dispatch_experiments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dispatch_experiments TO authenticated;
GRANT ALL ON TABLE public.dispatch_experiments TO service_role;

DROP POLICY IF EXISTS dispatch_experiments_select_auth ON public.dispatch_experiments;
CREATE POLICY dispatch_experiments_select_auth
  ON public.dispatch_experiments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.get_dispatch_experiment_variant(
  p_key           text,
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exp public.dispatch_experiments%ROWTYPE;
  v_bucket integer;
BEGIN
  SELECT * INTO v_exp
  FROM public.dispatch_experiments
  WHERE key = p_key;

  IF NOT FOUND OR v_exp.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'key', p_key,
      'variant', 'control',
      'config', COALESCE(v_exp.variant_a, '{}'::jsonb)
    );
  END IF;

  v_bucket := ABS(hashtext(p_key || ':' || COALESCE(p_assignment_id::text, ''))) % 100;
  IF v_bucket < v_exp.traffic_b_pct THEN
    RETURN jsonb_build_object(
      'key', p_key,
      'variant', 'B',
      'config', v_exp.variant_b
    );
  ELSE
    RETURN jsonb_build_object(
      'key', p_key,
      'variant', 'A',
      'config', v_exp.variant_a
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dispatch_experiment_variant(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dispatch_experiment_variant(text, uuid) TO authenticated, service_role;

-- 3. RPC get_dispatch_health_metrics para o painel /ddt-admin/entregadores/saude (§8.3 + §9)
CREATE OR REPLACE FUNCTION public.get_dispatch_health_metrics(
  p_days integer DEFAULT 14,
  p_city text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 14), 1), 90));
  v_city text := NULLIF(TRIM(COALESCE(p_city, '')), '');
  v_summary jsonb;
  v_tiers jsonb;
  v_daily jsonb;
  v_recent_events jsonb;
  v_density jsonb;
BEGIN
  WITH scoped_assignments AS (
    SELECT
      da.id,
      da.status,
      da.assigned_at,
      da.accepted_at,
      da.picked_up_at,
      da.cancelled_at,
      da.dispatch_tier,
      da.dispatch_exhausted_at,
      da.dispatch_exhausted_reason,
      da.dimensions_unknown,
      da.delivery_fee,
      da.bonus_amount,
      EXTRACT(EPOCH FROM (da.accepted_at - da.assigned_at)) / 60.0 AS accept_min,
      EXTRACT(EPOCH FROM (da.picked_up_at - da.accepted_at)) / 60.0 AS wait_store_min,
      sa.city AS store_city
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id
    LEFT JOIN LATERAL (
      SELECT a.city FROM public.addresses a
      WHERE a.store_id = o.store_id OR a.partner_id = da.partner_id
      ORDER BY CASE WHEN a.store_id = o.store_id THEN 1 ELSE 2 END, a.created_at ASC
      LIMIT 1
    ) sa ON true
    WHERE da.assigned_at >= v_since
      AND (v_city IS NULL OR LOWER(TRIM(COALESCE(sa.city, ''))) = LOWER(v_city))
  ),
  accepted_offers AS (
    SELECT DISTINCT ON (dof.assignment_id)
      dof.assignment_id,
      dof.tier,
      dof.pickup_km
    FROM public.delivery_offers dof
    JOIN scoped_assignments sa ON sa.id = dof.assignment_id
    WHERE dof.status = 'accepted'
    ORDER BY dof.assignment_id, dof.responded_at DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'total_requests', count(*),
    'accepted_count', count(*) FILTER (WHERE sa.accepted_at IS NOT NULL),
    'accepted_tier0_count', count(*) FILTER (WHERE ao.tier = 0),
    'exhausted_count', count(*) FILTER (WHERE sa.dispatch_exhausted_at IS NOT NULL),
    'economic_cap_blocked_count', count(*) FILTER (WHERE sa.dispatch_exhausted_reason = 'no_economically_viable_courier'),
    'post_accept_cancelled_count', count(*) FILTER (WHERE sa.accepted_at IS NOT NULL AND sa.status = 'cancelled'),
    'dimensions_complete_count', count(*) FILTER (WHERE sa.dimensions_unknown IS NOT TRUE),
    'dimensions_unknown_count', count(*) FILTER (WHERE sa.dimensions_unknown = true),
    'p50_accept_min', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY sa.accept_min) FILTER (WHERE sa.accept_min >= 0))::numeric, 2),
    'p90_accept_min', ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY sa.accept_min) FILTER (WHERE sa.accept_min >= 0))::numeric, 2),
    'p50_store_wait_min', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY sa.wait_store_min) FILTER (WHERE sa.wait_store_min >= 0))::numeric, 2),
    'avg_pickup_km', ROUND(AVG(ao.pickup_km)::numeric, 2),
    'avg_delivery_fee', ROUND(AVG(sa.delivery_fee)::numeric, 2)
  )
  INTO v_summary
  FROM scoped_assignments sa
  LEFT JOIN accepted_offers ao ON ao.assignment_id = sa.id;

  -- Distribuição por tier alcançado
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tier', t.dispatch_tier,
    'count', t.cnt
  ) ORDER BY t.dispatch_tier), '[]'::jsonb)
  INTO v_tiers
  FROM (
    SELECT da.dispatch_tier, count(*)::integer AS cnt
    FROM public.delivery_assignments da
    WHERE da.assigned_at >= v_since
    GROUP BY da.dispatch_tier
  ) t;

  -- Funil diário
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', d.day_str,
    'requests', d.requests,
    'accepted', d.accepted,
    'exhausted', d.exhausted,
    'p50_accept_min', d.p50_accept_min
  ) ORDER BY d.day_str DESC), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      to_char(da.assigned_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day_str,
      count(*)::integer AS requests,
      count(*) FILTER (WHERE da.accepted_at IS NOT NULL)::integer AS accepted,
      count(*) FILTER (WHERE da.dispatch_exhausted_at IS NOT NULL)::integer AS exhausted,
      ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (da.accepted_at - da.assigned_at)) / 60.0) FILTER (WHERE da.accepted_at >= da.assigned_at))::numeric, 2) AS p50_accept_min
    FROM public.delivery_assignments da
    WHERE da.assigned_at >= v_since
    GROUP BY 1
  ) d;

  -- Últimos eventos de telemetria ("por que ninguém pegou?")
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'assignment_id', e.assignment_id,
    'tier', e.tier,
    'candidates', e.candidates,
    'eligible', e.eligible,
    'offers_created', e.offers_created,
    'effective_max_km', e.effective_max_km,
    'economic_cap_km', e.economic_cap_km,
    'suggested_fee', e.suggested_fee,
    'outcome', e.outcome,
    'took_ms', e.took_ms,
    'created_at', e.created_at
  ) ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb)
  INTO v_recent_events
  FROM (
    SELECT * FROM public.delivery_dispatch_events
    WHERE created_at >= v_since
    ORDER BY created_at DESC, id DESC
    LIMIT 25
  ) e;

  -- Critério §4.4 para ligar mode='directed': >= 80% dos pedidos com >= 4 elegíveis em <= 4 km
  SELECT jsonb_build_object(
    'evaluated_dispatches', count(*),
    'meeting_density_4km', count(*) FILTER (WHERE e.eligible >= 4),
    'pct_meeting_density', CASE
      WHEN count(*) = 0 THEN 0
      ELSE ROUND((count(*) FILTER (WHERE e.eligible >= 4))::numeric * 100.0 / count(*), 1)
    END,
    'ready_for_directed_mode', (count(*) >= 20 AND (count(*) FILTER (WHERE e.eligible >= 4))::numeric / GREATEST(count(*), 1) >= 0.80)
  )
  INTO v_density
  FROM public.delivery_dispatch_events e
  WHERE e.created_at >= v_since
    AND e.tier <= 1
    AND COALESCE(e.effective_max_km, 0) <= 4.0;

  RETURN jsonb_build_object(
    'days', p_days,
    'city', v_city,
    'summary', v_summary,
    'tiers', v_tiers,
    'daily_funnel', v_daily,
    'recent_events', v_recent_events,
    'density_readiness', v_density
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dispatch_health_metrics(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dispatch_health_metrics(integer, text) TO service_role;
