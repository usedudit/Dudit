-- ============================================================================
-- Migration: 20261123_1200_offer_eta_and_vehicle_compat.sql
-- Descrição (Fase 1b — Raciocinar em minutos + compatibilidade de veículo):
--   1. Cria tabela public.delivery_vehicle_speeds (velocidade média por
--      veículo e faixa horária) com RLS ENABLE + FORCE.
--   2. Cria funções:
--      - public.estimate_road_km(p_straight_km, p_circuity DEFAULT 1.35)
--      - public.estimate_travel_min(p_km, p_vehicle, p_hour)
--      - public.vehicle_compatible(p_vehicle, p_weight, p_volume)
--   3. Atualiza public.get_available_delivery_offers v2 para:
--      - ler posição via public.delivery_driver_presence (GPS live < 2 min
--        ou fallback de endereço),
--      - retornar pickup_km, pickup_minutes, delivery_km, delivery_minutes,
--        eta_total_minutes (inclui handoff_min = 5 + últimos 50m = 2),
--        vehicle_compatible e position_quality.
-- ============================================================================

-- 1. Tabela de velocidades médias por veículo e faixa horária
CREATE TABLE IF NOT EXISTS public.delivery_vehicle_speeds (
  vehicle_type text NOT NULL,
  hour_start   smallint NOT NULL CHECK (hour_start >= 0 AND hour_start <= 23),
  hour_end     smallint NOT NULL CHECK (hour_end >= 0 AND hour_end <= 24 AND hour_end > hour_start),
  speed_kmh    numeric(5,2) NOT NULL CHECK (speed_kmh > 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vehicle_type, hour_start)
);

ALTER TABLE public.delivery_vehicle_speeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_vehicle_speeds FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_vehicle_speeds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_vehicle_speeds TO authenticated;
GRANT ALL ON TABLE public.delivery_vehicle_speeds TO service_role;

DROP POLICY IF EXISTS delivery_vehicle_speeds_select_auth ON public.delivery_vehicle_speeds;
CREATE POLICY delivery_vehicle_speeds_select_auth
  ON public.delivery_vehicle_speeds
  FOR SELECT
  TO authenticated
  USING (true);

-- Parâmetros iniciais (§4.6): moto 24 / carro 20 / bike 13 km/h (ajustado para horário de pico/madrugada)
INSERT INTO public.delivery_vehicle_speeds (vehicle_type, hour_start, hour_end, speed_kmh) VALUES
  ('moto',      0,  6, 28.0),
  ('moto',      6, 11, 24.0),
  ('moto',     11, 14, 21.0),
  ('moto',     14, 17, 24.0),
  ('moto',     17, 20, 20.0),
  ('moto',     20, 24, 25.0),
  ('carro',     0,  6, 26.0),
  ('carro',     6, 11, 20.0),
  ('carro',    11, 14, 16.0),
  ('carro',    14, 17, 20.0),
  ('carro',    17, 20, 15.0),
  ('carro',    20, 24, 22.0),
  ('bike',      0, 24, 13.0),
  ('bicicleta', 0, 24, 13.0)
ON CONFLICT (vehicle_type, hour_start) DO NOTHING;

-- 2. Funções de estimativa de rota, tempo e compatibilidade de veículo
CREATE OR REPLACE FUNCTION public.estimate_road_km(
  p_straight_km numeric,
  p_circuity numeric DEFAULT 1.35
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_straight_km IS NULL OR p_straight_km < 0 THEN NULL
    WHEN p_straight_km = 0 THEN 0.0
    ELSE ROUND(p_straight_km * COALESCE(NULLIF(p_circuity, 0), 1.35), 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.estimate_travel_min(
  p_km numeric,
  p_vehicle text DEFAULT 'moto',
  p_hour integer DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vehicle text := LOWER(TRIM(COALESCE(p_vehicle, 'moto')));
  v_hour integer := COALESCE(
    p_hour,
    EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::integer
  );
  v_speed numeric;
BEGIN
  IF p_km IS NULL OR p_km < 0 THEN
    RETURN NULL;
  END IF;

  IF p_km = 0 THEN
    RETURN 0;
  END IF;

  SELECT s.speed_kmh
  INTO v_speed
  FROM public.delivery_vehicle_speeds s
  WHERE s.vehicle_type = v_vehicle
    AND v_hour >= s.hour_start
    AND v_hour < s.hour_end
  LIMIT 1;

  IF v_speed IS NULL OR v_speed <= 0 THEN
    v_speed := CASE
      WHEN v_vehicle IN ('bike', 'bicicleta') THEN 13.0
      WHEN v_vehicle = 'carro' THEN 20.0
      ELSE 24.0
    END;
  END IF;

  RETURN GREATEST(1, ROUND((p_km / v_speed) * 60.0));
END;
$$;

CREATE OR REPLACE FUNCTION public.vehicle_compatible(
  p_vehicle text,
  p_weight numeric,
  p_volume numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    -- Sem peso/volume informado: nunca bloqueia (§5.1 / §12.3)
    WHEN COALESCE(p_weight, 0) <= 0 AND COALESCE(p_volume, 0) <= 0 THEN true
    WHEN LOWER(TRIM(COALESCE(p_vehicle, 'moto'))) IN ('bike', 'bicicleta') THEN
      (COALESCE(p_weight, 0) <= 8.0) AND (COALESCE(p_volume, 0) <= 35.0)
    WHEN LOWER(TRIM(COALESCE(p_vehicle, 'moto'))) = 'moto' THEN
      (COALESCE(p_weight, 0) <= 15.0) AND (COALESCE(p_volume, 0) <= 60.0)
    WHEN LOWER(TRIM(COALESCE(p_vehicle, 'moto'))) = 'carro' THEN
      (COALESCE(p_weight, 0) <= 120.0) AND (COALESCE(p_volume, 0) <= 400.0)
    ELSE true
  END;
$$;

REVOKE ALL ON FUNCTION public.estimate_road_km(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_road_km(numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.estimate_travel_min(numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estimate_travel_min(numeric, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.vehicle_compatible(text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vehicle_compatible(text, numeric, numeric) TO authenticated;

-- 3. Atualizar get_available_delivery_offers v2 com presença live, ETA em minutos e vehicle_compatible
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers();

CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_driver_city text;
  v_driver_state text;
  v_driver_lat numeric(10, 7);
  v_driver_lon numeric(10, 7);
  v_is_active boolean;
  v_availability_status text;
  v_vehicle_type text;
  v_capacity_orders smallint;
  v_driver_max_pickup_km numeric;
  v_cooldown_until timestamptz;
  v_active_count integer := 0;
  v_position_quality text := 'unknown';
  v_has_partner_links boolean := false;
  v_hour integer := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::integer;
  v_handoff_min integer := 5;
  v_last50m_min integer := 2;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 1. Ler presença unificada do entregador (GPS live < 2 min ou fallback de endereço)
  SELECT
    dp.is_active,
    dp.availability_status,
    dp.vehicle_type,
    COALESCE(dp.capacity_orders, 1),
    dp.max_pickup_km,
    dp.cooldown_until,
    dp.active_count,
    dp.lat,
    dp.lng,
    dp.city,
    dp.state,
    dp.position_quality
  INTO
    v_is_active,
    v_availability_status,
    v_vehicle_type,
    v_capacity_orders,
    v_driver_max_pickup_km,
    v_cooldown_until,
    v_active_count,
    v_driver_lat,
    v_driver_lon,
    v_driver_city,
    v_driver_state,
    v_position_quality
  FROM public.delivery_driver_presence dp
  WHERE dp.user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Cooldown por recusa
  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > now() THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Ocultar ofertas de entregador lotado
  IF v_active_count >= GREATEST(COALESCE(v_capacity_orders, 1), 1) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Vínculo restrito a parceiros específicos (se existir)
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_driver_partners ddp
    WHERE ddp.driver_id = v_user
      AND ddp.is_active = true
  ) INTO v_has_partner_links;

  WITH distinct_offers AS (
    SELECT DISTINCT ON (COALESCE(da.delivery_id, da.id))
      da.id AS assignment_id,
      da.id,
      da.order_id,
      da.delivery_id,
      da.partner_id,
      da.status,
      da.assigned_at,
      da.delivery_fee AS raw_fee,
      da.notes,
      da.dimensions_unknown,
      o.order_number,
      o.delivery_address,
      o.total_amount AS raw_amount,
      o.payment_method,
      o.situation,
      o.delivery_status,
      o.delivery_type,
      o.created_at AS order_created_at,
      o.store_id,
      o.buyer_id,
      o.package_weight_kg,
      o.package_volume_l,
      CASE
        WHEN (o.delivery_breakdown->>'distanceKm') ~ '^[0-9]+(\.[0-9]+)?$'
          AND (o.delivery_breakdown->>'distanceKm')::numeric > 0
        THEN ROUND((o.delivery_breakdown->>'distanceKm')::numeric, 2)
        ELSE NULL
      END AS delivery_distance_km,
      sa.city AS store_city,
      sa.state AS store_state,
      sa.latitude AS store_lat,
      sa.longitude AS store_lon,
      dist.dist_km AS pickup_straight_km,
      public.estimate_road_km(dist.dist_km, 1.35) AS pickup_km,
      eff.max_radius_km
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    LEFT JOIN LATERAL (
      SELECT a.city, a.state, a.latitude, a.longitude, a.street, a.number, a.neighborhood
      FROM public.addresses a
      WHERE a.store_id = o.store_id
         OR (o.store_id IS NULL AND a.partner_id = da.partner_id)
         OR a.partner_id = da.partner_id
      ORDER BY
        CASE WHEN a.store_id = o.store_id AND a.is_default = true THEN 1
             WHEN a.store_id = o.store_id THEN 2
             WHEN a.is_default = true THEN 3
             ELSE 4 END,
        a.created_at ASC
      LIMIT 1
    ) sa ON true
    LEFT JOIN LATERAL (
      SELECT ds.max_delivery_km
      FROM public.delivery_settings ds
      WHERE (o.store_id IS NOT NULL AND ds.store_id = o.store_id)
         OR (ds.store_id IS NULL AND ds.partner_id = da.partner_id)
      ORDER BY
        CASE WHEN o.store_id IS NOT NULL AND ds.store_id = o.store_id THEN 1 ELSE 2 END
      LIMIT 1
    ) ds ON true
    CROSS JOIN LATERAL (
      SELECT
        public.haversine_distance_km(v_driver_lat, v_driver_lon, sa.latitude, sa.longitude) AS dist_km
    ) dist
    CROSS JOIN LATERAL (
      SELECT LEAST(
        COALESCE(ds.max_delivery_km, v_driver_max_pickup_km, 20.0),
        COALESCE(v_driver_max_pickup_km, ds.max_delivery_km, 20.0)
      ) AS max_radius_km
    ) eff
    WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
      AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
      AND (
        NOT v_has_partner_links
        OR EXISTS (
          SELECT 1
          FROM public.delivery_driver_partners ddp
          WHERE ddp.driver_id = v_user
            AND ddp.partner_id = da.partner_id
            AND ddp.is_active = true
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = da.delivery_id
          AND (
            d.status IN ('sent', 'delivered', 'cancelled')
            OR (
              d.delivery_person_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM public.partner_users pu
                WHERE pu.id = d.delivery_person_id AND pu.user_id = v_user
              )
            )
          )
      )
      AND (
        (dist.dist_km IS NOT NULL AND dist.dist_km <= eff.max_radius_km)
        OR (
          v_driver_lat IS NULL
          AND v_driver_lon IS NULL
          AND sa.latitude IS NULL
          AND sa.longitude IS NULL
          AND v_driver_city IS NOT NULL AND TRIM(v_driver_city) <> ''
          AND v_driver_state IS NOT NULL AND TRIM(v_driver_state) <> ''
          AND sa.city IS NOT NULL AND TRIM(sa.city) <> ''
          AND sa.state IS NOT NULL AND TRIM(sa.state) <> ''
          AND LOWER(TRIM(sa.city)) = LOWER(TRIM(v_driver_city))
          AND LOWER(TRIM(sa.state)) = LOWER(TRIM(v_driver_state))
        )
      )
    ORDER BY COALESCE(da.delivery_id, da.id), da.assigned_at DESC, da.id DESC
  ),
  aggregated_offers AS (
    SELECT
      dto.id,
      dto.assignment_id,
      dto.order_id,
      dto.delivery_id,
      dto.partner_id,
      dto.status,
      dto.assigned_at,
      dto.pickup_km,
      dto.pickup_km AS pickup_distance_km,
      COALESCE(dto.pickup_km, 0) AS distance_km,
      eta.pickup_minutes,
      dto.delivery_distance_km AS delivery_km,
      dto.delivery_distance_km,
      eta.delivery_minutes,
      eta.eta_total_minutes,
      public.vehicle_compatible(v_vehicle_type, dto.package_weight_kg, dto.package_volume_l) AS vehicle_compatible,
      v_position_quality AS position_quality,
      calc.route_km,
      CASE
        WHEN calc.route_km IS NOT NULL AND calc.route_km > 0
        THEN ROUND(calc.total_fee / calc.route_km, 2)
        ELSE NULL
      END AS rs_per_km,
      dto.dimensions_unknown,
      dto.package_weight_kg,
      dto.package_volume_l,
      calc.total_fee AS delivery_fee,
      dto.order_number,
      COALESCE((
        SELECT count(DISTINCT do_cnt.order_id)
        FROM public.delivery_orders do_cnt
        WHERE do_cnt.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), 1::bigint) AS order_count,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
      COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
      COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
      COALESCE(
        (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = dto.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
        o_primary.delivery_address,
        ''
      ) AS store_address,
      -- LGPD / Minimização de dados: dados pessoais do cliente ocultados antes do aceite
      'Cliente'::text AS customer_name,
      ''::text AS customer_phone,
      dto.delivery_address,
      COALESCE((
        SELECT SUM(o2.total_amount)
        FROM public.delivery_orders do_sum
        JOIN public.orders o2 ON o2.id = do_sum.order_id
        WHERE do_sum.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), dto.raw_amount) AS total_amount,
      dto.payment_method,
      dto.situation AS payment_status,
      dto.situation,
      dto.delivery_status,
      dto.delivery_type,
      dto.order_created_at AS created_at,
      dto.notes,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'name', oi.product_name,
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'price', oi.product_price,
          'product_price', oi.product_price,
          'unit_price', oi.product_price,
          'subtotal', COALESCE(oi.subtotal, oi.product_price * oi.quantity),
          'sku', COALESCE(pv.sku, pr.sku, 'N/A'),
          'images', pr.images,
          'image_url', pr.images,
          'unit', COALESCE(pr.unit, 'un')
        ) ORDER BY oi.id)
        FROM public.order_items oi
        LEFT JOIN public.products pr ON pr.id = oi.product_id
        LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
        WHERE (dto.delivery_id IS NOT NULL AND oi.order_id IN (SELECT do_i.order_id FROM public.delivery_orders do_i WHERE do_i.delivery_id = dto.delivery_id))
           OR (dto.delivery_id IS NULL AND oi.order_id = dto.order_id)
      ), '[]'::jsonb) AS items,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'order_id', o_inner.id,
          'order_number', o_inner.order_number,
          'position', COALESCE(do_inner.position, 1),
          'total_amount', o_inner.total_amount,
          'delivery_fee', COALESCE(o_inner.delivery_fee, 0),
          'delivery_address', o_inner.delivery_address,
          'customer_name', 'Destinatário',
          'customer_phone', '',
          'payment_method', o_inner.payment_method,
          'payment_status', o_inner.situation,
          'situation', o_inner.situation,
          'delivery_status', o_inner.delivery_status,
          'delivery_type', o_inner.delivery_type,
          'created_at', o_inner.created_at,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', oi_inner.id,
              'name', oi_inner.product_name,
              'product_name', oi_inner.product_name,
              'quantity', oi_inner.quantity,
              'price', oi_inner.product_price,
              'product_price', oi_inner.product_price,
              'unit_price', oi_inner.product_price,
              'subtotal', COALESCE(oi_inner.subtotal, oi_inner.product_price * oi_inner.quantity),
              'sku', COALESCE(pv_inner.sku, pr_inner.sku, 'N/A'),
              'images', pr_inner.images,
              'image_url', pr_inner.images,
              'unit', COALESCE(pr_inner.unit, 'un')
            ) ORDER BY oi_inner.id)
            FROM public.order_items oi_inner
            LEFT JOIN public.products pr_inner ON pr_inner.id = oi_inner.product_id
            LEFT JOIN public.product_variants pv_inner ON pv_inner.id = oi_inner.variant_id
            WHERE oi_inner.order_id = o_inner.id
          ), '[]'::jsonb)
        ) ORDER BY COALESCE(do_inner.position, 1), o_inner.id)
        FROM public.delivery_orders do_inner
        JOIN public.orders o_inner ON o_inner.id = do_inner.order_id
        WHERE do_inner.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), '[]'::jsonb) AS orders
    FROM distinct_offers dto
    JOIN public.orders o_primary ON o_primary.id = dto.order_id AND o_primary.partner_id = dto.partner_id
    JOIN public.partners p ON p.id = dto.partner_id
    LEFT JOIN public.stores s ON s.id = o_primary.store_id
    CROSS JOIN LATERAL (
      SELECT
        COALESCE((
          SELECT SUM(da2.delivery_fee)
          FROM public.delivery_assignments da2
          WHERE (dto.delivery_id IS NOT NULL AND da2.delivery_id = dto.delivery_id)
             OR (dto.delivery_id IS NULL AND da2.id = dto.id)
        ), dto.raw_fee, 0) AS total_fee,
        NULLIF(
          ROUND(
            COALESCE(dto.pickup_km, 0) + COALESCE(dto.delivery_distance_km, 0),
            2
          ),
          0
        ) AS route_km
    ) calc
    CROSS JOIN LATERAL (
      SELECT
        public.estimate_travel_min(dto.pickup_km, v_vehicle_type, v_hour) AS pickup_minutes,
        public.estimate_travel_min(dto.delivery_distance_km, v_vehicle_type, v_hour) AS delivery_minutes
    ) raw_eta
    CROSS JOIN LATERAL (
      SELECT
        raw_eta.pickup_minutes,
        raw_eta.delivery_minutes,
        CASE
          WHEN raw_eta.pickup_minutes IS NOT NULL OR raw_eta.delivery_minutes IS NOT NULL
          THEN COALESCE(raw_eta.pickup_minutes, 0)
             + v_handoff_min
             + COALESCE(raw_eta.delivery_minutes, 0)
             + CASE WHEN raw_eta.delivery_minutes IS NOT NULL THEN v_last50m_min ELSE 0 END
          ELSE NULL
        END AS eta_total_minutes
    ) eta
    ORDER BY
      public.vehicle_compatible(v_vehicle_type, dto.package_weight_kg, dto.package_volume_l) DESC,
      COALESCE(eta.pickup_minutes, 9999) ASC,
      dto.assigned_at DESC,
      dto.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(ao)::jsonb), '[]'::jsonb)
  INTO v_result
  FROM aggregated_offers ao;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_delivery_offers(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_delivery_offers(integer) TO authenticated;
