-- ============================================================================
-- Migration: 20261123_1000_dispatch_fase0_radius_and_eligibility.sql
-- Descrição (Fase 0 — Parar de errar):
--   0.1 Substitui raio 20 km hardcoded por delivery_settings.max_delivery_km /
--       delivery_drivers.max_pickup_km (fallback 20 km) via LEFT JOIN LATERAL.
--   0.2 Fecha o buraco do fallback por cidade: só vale quando AMBOS os lados
--       não têm coordenadas, com cidade E estado preenchidos e iguais.
--   0.3 Oculta ofertas de entregador com active_count >= capacity_orders.
--   0.4 Adiciona reject_streak e cooldown_until em delivery_drivers e filtra
--       entregadores em cooldown tanto na listagem quanto no aceite.
--   0.5 Remove expiração fixa de 15 minutos em get_available_delivery_offers
--       e accept_delivery_offer (oferta permanece disponível enquanto status
--       estiver aberto e pedido não despachado/cancelado).
--   0.6 Prepara colunas de veículo/carga: delivery_drivers(capacity_orders,
--       has_thermal_bag, max_pickup_km) e orders(package_weight_kg,
--       package_volume_l).
--   0.7 Adiciona delivery_assignments.dimensions_unknown (boolean) e expõe na RPC.
--   0.8 Calcula e expõe delivery_distance_km, route_km e rs_per_km na RPC.
--   Preserva integralmente o hardening LGPD de 20261112_delivery_offers_privacy_hardening.sql.
-- ============================================================================

-- 1. Schema updates (idempotentes)
ALTER TABLE public.delivery_drivers
  ADD COLUMN IF NOT EXISTS reject_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS capacity_orders smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS has_thermal_bag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_pickup_km numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_drivers_capacity_orders_check'
      AND conrelid = 'public.delivery_drivers'::regclass
  ) THEN
    ALTER TABLE public.delivery_drivers
      ADD CONSTRAINT delivery_drivers_capacity_orders_check
      CHECK (capacity_orders >= 1 AND capacity_orders <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_drivers_max_pickup_km_check'
      AND conrelid = 'public.delivery_drivers'::regclass
  ) THEN
    ALTER TABLE public.delivery_drivers
      ADD CONSTRAINT delivery_drivers_max_pickup_km_check
      CHECK (max_pickup_km IS NULL OR max_pickup_km > 0);
  END IF;
END
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS package_volume_l numeric;

ALTER TABLE public.delivery_assignments
  ADD COLUMN IF NOT EXISTS dimensions_unknown boolean NOT NULL DEFAULT false;

-- 2. Atualizar RPC get_available_delivery_offers
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
  v_driver_neighborhood text;
  v_driver_street text;
  v_driver_number text;
  v_driver_complement text;
  v_driver_state text;
  v_driver_zip text;
  v_driver_lat numeric(10, 7);
  v_driver_lon numeric(10, 7);
  v_is_active boolean;
  v_availability_status text;
  v_capacity_orders smallint;
  v_driver_max_pickup_km numeric;
  v_cooldown_until timestamptz;
  v_active_count integer := 0;
  v_has_partner_links boolean := false;
  v_addr_city text;
  v_addr_neighborhood text;
  v_addr_street text;
  v_addr_number text;
  v_addr_complement text;
  v_addr_state text;
  v_addr_zip text;
  v_addr_lat numeric(10, 7);
  v_addr_lon numeric(10, 7);
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 1. Verificar se o entregador está cadastrado, ativo, fora de cooldown e com capacidade livre
  SELECT
    is_active,
    availability_status,
    city,
    neighborhood,
    street,
    number,
    complement,
    state,
    zip_code,
    latitude,
    longitude,
    COALESCE(capacity_orders, 1),
    max_pickup_km,
    cooldown_until
  INTO
    v_is_active,
    v_availability_status,
    v_driver_city,
    v_driver_neighborhood,
    v_driver_street,
    v_driver_number,
    v_driver_complement,
    v_driver_state,
    v_driver_zip,
    v_driver_lat,
    v_driver_lon,
    v_capacity_orders,
    v_driver_max_pickup_km,
    v_cooldown_until
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 0.4 Cooldown por recusa
  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > now() THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 0.3 Ocultar ofertas de entregador lotado (mesma contagem de rotas ativas do dashboard/accept)
  SELECT count(DISTINCT COALESCE(da.delivery_id, da.id))
  INTO v_active_count
  FROM public.delivery_assignments da
  WHERE da.driver_id = v_user
    AND da.status IN ('accepted', 'picked_up', 'out_for_delivery');

  IF v_active_count >= GREATEST(COALESCE(v_capacity_orders, 1), 1) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Verificar se o entregador possui vínculo restrito a parceiros específicos
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_driver_partners ddp
    WHERE ddp.driver_id = v_user
      AND ddp.is_active = true
  ) INTO v_has_partner_links;

  -- 2. Resolver localização do entregador priorizando o endereço ativo/padrão do perfil em addresses
  SELECT city, neighborhood, street, number, complement, state, zip_code, latitude, longitude
  INTO v_addr_city, v_addr_neighborhood, v_addr_street, v_addr_number, v_addr_complement, v_addr_state, v_addr_zip, v_addr_lat, v_addr_lon
  FROM public.addresses
  WHERE user_id = v_user
  ORDER BY is_default DESC, updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_driver_city := COALESCE(v_addr_city, v_driver_city);
    v_driver_neighborhood := COALESCE(v_addr_neighborhood, v_driver_neighborhood);
    v_driver_street := COALESCE(v_addr_street, v_driver_street);
    v_driver_number := COALESCE(v_addr_number, v_driver_number);
    v_driver_complement := COALESCE(v_addr_complement, v_driver_complement);
    v_driver_state := COALESCE(v_addr_state, v_driver_state);
    v_driver_zip := COALESCE(v_addr_zip, v_driver_zip);
    v_driver_lat := COALESCE(v_addr_lat, v_driver_lat);
    v_driver_lon := COALESCE(v_addr_lon, v_driver_lon);

    IF v_addr_city IS NOT NULL OR v_addr_lat IS NOT NULL THEN
      UPDATE public.delivery_drivers
      SET city = COALESCE(v_driver_city, city),
          neighborhood = COALESCE(v_driver_neighborhood, neighborhood),
          street = COALESCE(v_driver_street, street),
          number = COALESCE(v_driver_number, number),
          complement = COALESCE(v_driver_complement, complement),
          state = COALESCE(v_driver_state, state),
          zip_code = COALESCE(v_driver_zip, zip_code),
          latitude = COALESCE(v_driver_lat, latitude),
          longitude = COALESCE(v_driver_lon, longitude),
          updated_at = now()
      WHERE user_id = v_user
        AND (
          city IS DISTINCT FROM v_driver_city
          OR state IS DISTINCT FROM v_driver_state
          OR latitude IS DISTINCT FROM v_driver_lat
          OR longitude IS DISTINCT FROM v_driver_lon
        );
    END IF;
  END IF;

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
      dist.dist_km AS pickup_distance_km,
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
      -- 0.5 Removida expiração fixa de 15 minutos; oferta permanece elegível enquanto aberta e pedido ativo
      AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
      -- Respeita vínculo de frota dedicada quando existente (rede aberta caso contrário)
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
      -- 0.1 Raio dinâmico (delivery_settings.max_delivery_km / driver.max_pickup_km / 20 km)
      -- 0.2 Fallback por cidade apenas quando AMBOS os lados não têm coordenadas e cidade+estado batem
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
      dto.pickup_distance_km,
      COALESCE(dto.pickup_distance_km, 0) AS distance_km,
      dto.delivery_distance_km,
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
            COALESCE(dto.pickup_distance_km, 0) + COALESCE(dto.delivery_distance_km, 0),
            2
          ),
          0
        ) AS route_km
    ) calc
    ORDER BY
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

-- 3. Atualizar RPC accept_delivery_offer (consistente com capacity_orders, cooldown_until e sem expiração de 15 min)
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_assignment public.delivery_assignments%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
  v_now timestamptz := now();
  v_active_count integer;
  v_driver_city text;
  v_is_active boolean;
  v_capacity_orders smallint;
  v_cooldown_until timestamptz;
  v_partner_user_id uuid;
BEGIN
  -- Verificar se entregador está ativo, fora de cooldown e ler capacidade
  SELECT is_active, city, COALESCE(capacity_orders, 1), cooldown_until
  INTO v_is_active, v_driver_city, v_capacity_orders, v_cooldown_until
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > v_now THEN
    RAISE EXCEPTION 'delivery_driver_in_cooldown';
  END IF;

  -- Trava de capacidade dinâmica (capacity_orders)
  SELECT count(DISTINCT COALESCE(delivery_id, id)) INTO v_active_count
  FROM public.delivery_assignments
  WHERE driver_id = v_user
    AND status IN ('accepted', 'picked_up', 'out_for_delivery');

  IF v_active_count >= GREATEST(COALESCE(v_capacity_orders, 1), 1) THEN
    RAISE EXCEPTION 'delivery_driver_busy';
  END IF;

  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_assignment_not_found';
  END IF;

  IF v_assignment.status = 'cancelled' THEN
    RAISE EXCEPTION 'delivery_assignment_cancelled';
  END IF;

  IF v_assignment.driver_id IS NOT NULL AND v_assignment.driver_id <> v_user THEN
    RAISE EXCEPTION 'delivery_assignment_already_accepted';
  END IF;

  IF v_assignment.status NOT IN ('available', 'requested', 'assigned') THEN
    RAISE EXCEPTION 'delivery_assignment_not_available';
  END IF;

  -- Lookup partner_users.id for this driver (needed for delivery_person_id FK)
  SELECT pu.id INTO v_partner_user_id
  FROM public.partner_users pu
  WHERE pu.user_id = v_user AND pu.partner_id = v_assignment.partner_id
  LIMIT 1;

  -- VALIDAÇÃO CRÍTICA DE ENTREGA PRÓPRIA / EQUIPE OU JÁ DESPACHADA:
  IF v_assignment.delivery_id IS NOT NULL THEN
    SELECT * INTO v_delivery
    FROM public.deliveries
    WHERE id = v_assignment.delivery_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_delivery.status IN ('delivered', 'cancelled') THEN
        UPDATE public.delivery_assignments
        SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
        WHERE delivery_id = v_assignment.delivery_id;

        RAISE EXCEPTION 'delivery_already_finished_or_cancelled';
      END IF;

      IF v_delivery.delivery_person_id IS NOT NULL
         AND v_partner_user_id IS NOT NULL
         AND v_delivery.delivery_person_id <> v_partner_user_id THEN
        UPDATE public.delivery_assignments
        SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
        WHERE delivery_id = v_assignment.delivery_id;

        RAISE EXCEPTION 'delivery_already_assigned_to_team_driver';
      END IF;
    END IF;
  END IF;

  -- Verificar se algum pedido desta entrega já foi despachado/entregue/cancelado no ERP
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE (
      (v_assignment.delivery_id IS NOT NULL AND o.id IN (SELECT do_inner.order_id FROM public.delivery_orders do_inner WHERE do_inner.delivery_id = v_assignment.delivery_id))
      OR (v_assignment.delivery_id IS NULL AND o.id = v_assignment.order_id)
    )
    AND o.partner_id = v_assignment.partner_id
    AND o.delivery_status IN ('sent', 'delivered', 'cancelled')
  ) THEN
    UPDATE public.delivery_assignments
    SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    WHERE id = v_assignment.id OR (v_assignment.delivery_id IS NOT NULL AND delivery_id = v_assignment.delivery_id);

    RAISE EXCEPTION 'order_already_dispatched_or_cancelled';
  END IF;

  -- Se pertencer a uma entrega agrupada com múltiplos pedidos, atualiza todos os pedidos da rota
  IF v_assignment.delivery_id IS NOT NULL THEN
    UPDATE public.delivery_assignments
    SET driver_id = v_user,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE delivery_id = v_assignment.delivery_id
      AND (driver_id IS NULL OR driver_id = v_user);

    UPDATE public.deliveries
    SET status = 'preparing',
        delivery_person_id = COALESCE(v_partner_user_id, delivery_person_id)
    WHERE id = v_assignment.delivery_id;

    UPDATE public.orders
    SET delivery_status = CASE WHEN delivery_status IN ('pending', 'not_sent') THEN 'preparing' ELSE delivery_status END
    WHERE id IN (
      SELECT do_inner.order_id
      FROM public.delivery_orders do_inner
      WHERE do_inner.delivery_id = v_assignment.delivery_id
    ) AND partner_id = v_assignment.partner_id;
  ELSE
    UPDATE public.delivery_assignments
    SET driver_id = v_user,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = v_assignment.id;

    UPDATE public.orders
    SET delivery_status = CASE WHEN delivery_status IN ('pending', 'not_sent') THEN 'preparing' ELSE delivery_status END
    WHERE id = v_assignment.order_id AND partner_id = v_assignment.partner_id;
  END IF;

  -- Zerar streak de recusa ao aceitar uma corrida
  UPDATE public.delivery_drivers
  SET reject_streak = 0,
      updated_at = v_now
  WHERE user_id = v_user
    AND reject_streak <> 0;

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_OFFER_ACCEPTED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_offer_accepted',
    ARRAY['Oferta de entrega aceita pelo entregador'],
    jsonb_build_object('order_id', v_assignment.order_id, 'delivery_id', v_assignment.delivery_id, 'driver_id', v_user),
    'delivery_driver_app'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'order_id', v_assignment.order_id,
    'delivery_id', v_assignment.delivery_id,
    'message', 'Oferta aceita com sucesso'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_delivery_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(uuid) TO authenticated;
