-- ============================================================================
-- Migration: 20261123_1500_tier_accept_decline.sql
-- Descrição (Fase 2c — Integração de tiers, aceite/recusa com cooldown e bônus):
--   1. Atualiza public.get_available_delivery_offers para:
--      - excluir ofertas já recusadas pelo entregador,
--      - retornar offer_id, offer_tier, offer_expires_at, offer_mode,
--        dispatch_tier e bonus_amount (somado no R$/km, separado da taxa).
--   2. Atualiza public.accept_delivery_offer para:
--      - validar oferta dirigida quando mode='directed' e preservar board,
--      - marcar delivery_offers como 'accepted' (e demais 'superseded')
--        com FOR UPDATE para rastreabilidade de tier e proteção contra race,
--      - zerar reject_streak ao aceitar.
--   3. Cria public.decline_delivery_offer(p_assignment_id, p_offer_id) com
--      incremento de reject_streak e aplicação de cooldown_until ao atingir
--      dispatch_settings.reject_threshold.
--   4. Cria public.authorize_delivery_bonus(p_assignment_id, p_amount, p_reason)
--      para bônus autorizado manualmente pelo parceiro (§7.4).
-- ============================================================================

-- 1. Atualizar get_available_delivery_offers com dados de delivery_offers e bônus
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

  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > now() THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_active_count >= GREATEST(COALESCE(v_capacity_orders, 1), 1) THEN
    RETURN '[]'::jsonb;
  END IF;

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
      COALESCE(da.bonus_amount, 0) AS bonus_amount,
      da.notes,
      da.dimensions_unknown,
      da.dispatch_tier,
      dof.id AS offer_id,
      dof.tier AS offer_tier,
      dof.mode AS offer_mode,
      dof.expires_at AS offer_expires_at,
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
      SELECT o_row.id, o_row.tier, o_row.mode, o_row.expires_at
      FROM public.delivery_offers o_row
      WHERE o_row.assignment_id = da.id
        AND o_row.driver_id = v_user
        AND o_row.status = 'pending'
        AND o_row.expires_at > now()
      ORDER BY o_row.tier DESC, o_row.created_at DESC
      LIMIT 1
    ) dof ON true
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
      -- Excluir ofertas que este entregador já recusou
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_offers dof_dec
        WHERE dof_dec.assignment_id = da.id
          AND dof_dec.driver_id = v_user
          AND dof_dec.status = 'declined'
      )
      -- Se existir oferta dirigida ativa para outro entregador (e nenhuma para este), ocultar
      AND (
        dof.id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.delivery_offers dof_dir
          WHERE dof_dir.assignment_id = da.id
            AND dof_dir.mode = 'directed'
            AND dof_dir.status = 'pending'
            AND dof_dir.expires_at > now()
            AND dof_dir.driver_id <> v_user
        )
      )
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
      dto.offer_id,
      dto.offer_tier,
      COALESCE(dto.offer_mode, 'board') AS offer_mode,
      dto.offer_expires_at,
      dto.dispatch_tier,
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
        THEN ROUND((calc.total_fee + calc.total_bonus) / calc.route_km, 2)
        ELSE NULL
      END AS rs_per_km,
      dto.dimensions_unknown,
      dto.package_weight_kg,
      dto.package_volume_l,
      calc.total_fee AS delivery_fee,
      calc.total_bonus AS bonus_amount,
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
        COALESCE((
          SELECT SUM(COALESCE(da2.bonus_amount, 0))
          FROM public.delivery_assignments da2
          WHERE (dto.delivery_id IS NOT NULL AND da2.delivery_id = dto.delivery_id)
             OR (dto.delivery_id IS NULL AND da2.id = dto.id)
        ), dto.bonus_amount, 0) AS total_bonus,
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

-- 2. Atualizar accept_delivery_offer com rastreabilidade de delivery_offers (FOR UPDATE)
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
  v_offer public.delivery_offers%ROWTYPE;
  v_now timestamptz := now();
  v_active_count integer;
  v_is_active boolean;
  v_capacity_orders smallint;
  v_cooldown_until timestamptz;
  v_partner_user_id uuid;
  v_has_other_directed boolean := false;
  v_accepted_tier smallint;
BEGIN
  SELECT is_active, COALESCE(capacity_orders, 1), cooldown_until
  INTO v_is_active, v_capacity_orders, v_cooldown_until
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > v_now THEN
    RAISE EXCEPTION 'delivery_driver_in_cooldown';
  END IF;

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

  -- Lock na oferta pendente deste entregador (se existir)
  SELECT * INTO v_offer
  FROM public.delivery_offers
  WHERE assignment_id = v_assignment.id
    AND driver_id = v_user
    AND status = 'pending'
    AND expires_at > v_now
  ORDER BY tier DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Se o assignment estiver em oferta dirigida exclusiva para outro entregador, bloquear
  IF v_offer.id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.delivery_offers
      WHERE assignment_id = v_assignment.id
        AND mode = 'directed'
        AND status = 'pending'
        AND expires_at > v_now
        AND driver_id <> v_user
    ) INTO v_has_other_directed;

    IF v_has_other_directed THEN
      RAISE EXCEPTION 'delivery_assignment_not_available';
    END IF;
  END IF;

  SELECT pu.id INTO v_partner_user_id
  FROM public.partner_users pu
  WHERE pu.user_id = v_user AND pu.partner_id = v_assignment.partner_id
  LIMIT 1;

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

  -- Atualizar delivery_assignments e orders
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

  -- Garantir rastreabilidade de tier em delivery_offers
  IF v_offer.id IS NOT NULL THEN
    v_accepted_tier := v_offer.tier;
    UPDATE public.delivery_offers
    SET status = 'accepted',
        responded_at = v_now
    WHERE id = v_offer.id;
  ELSE
    v_accepted_tier := COALESCE(v_assignment.dispatch_tier, 0);
    INSERT INTO public.delivery_offers (
      assignment_id, driver_id, tier, mode, score, expires_at, status, responded_at
    ) VALUES (
      v_assignment.id, v_user, v_accepted_tier, 'board', 0, v_now, 'accepted', v_now
    )
    ON CONFLICT (assignment_id, driver_id, tier) DO UPDATE
    SET status = 'accepted',
        responded_at = v_now;
  END IF;

  -- Supersede demais ofertas pendentes deste assignment
  UPDATE public.delivery_offers
  SET status = 'superseded'
  WHERE assignment_id = v_assignment.id
    AND status = 'pending'
    AND driver_id <> v_user;

  -- Aceite zera reject_streak
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
    jsonb_build_object(
      'order_id', v_assignment.order_id,
      'delivery_id', v_assignment.delivery_id,
      'driver_id', v_user,
      'tier', v_accepted_tier
    ),
    'delivery_driver_app'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'order_id', v_assignment.order_id,
    'delivery_id', v_assignment.delivery_id,
    'tier', v_accepted_tier,
    'message', 'Oferta aceita com sucesso'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_delivery_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(uuid) TO authenticated;

-- 3. RPC decline_delivery_offer (recusa explícita + reject_streak + cooldown)
CREATE OR REPLACE FUNCTION public.decline_delivery_offer(
  p_assignment_id uuid,
  p_offer_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_is_active boolean;
  v_streak integer;
  v_assignment public.delivery_assignments%ROWTYPE;
  v_threshold integer := 3;
  v_cooldown_min integer := 15;
  v_cooldown_until timestamptz := NULL;
  v_updated_offer_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_active, COALESCE(reject_streak, 0)
  INTO v_is_active, v_streak
  FROM public.delivery_drivers
  WHERE user_id = v_user
  FOR UPDATE;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_assignment_not_found';
  END IF;

  -- Ler parâmetros de cooldown da configuração
  SELECT COALESCE(ds.reject_threshold, 3), COALESCE(ds.reject_cooldown_min, 15)
  INTO v_threshold, v_cooldown_min
  FROM public.dispatch_settings ds
  WHERE (ds.partner_id = v_assignment.partner_id AND ds.store_id IS NULL)
     OR (ds.partner_id IS NULL AND ds.store_id IS NULL)
  ORDER BY CASE WHEN ds.partner_id = v_assignment.partner_id THEN 1 ELSE 2 END
  LIMIT 1;

  -- Marcar oferta como declined (ou criar registro declined para não reaparecer no board)
  IF p_offer_id IS NOT NULL THEN
    UPDATE public.delivery_offers
    SET status = 'declined',
        responded_at = v_now
    WHERE id = p_offer_id
      AND driver_id = v_user
      AND status = 'pending'
    RETURNING id INTO v_updated_offer_id;
  END IF;

  IF v_updated_offer_id IS NULL THEN
    UPDATE public.delivery_offers
    SET status = 'declined',
        responded_at = v_now
    WHERE assignment_id = v_assignment.id
      AND driver_id = v_user
      AND status = 'pending'
    RETURNING id INTO v_updated_offer_id;
  END IF;

  IF v_updated_offer_id IS NULL THEN
    INSERT INTO public.delivery_offers (
      assignment_id, driver_id, tier, mode, score, expires_at, status, responded_at
    ) VALUES (
      v_assignment.id, v_user, COALESCE(v_assignment.dispatch_tier, 0),
      'board', 0, v_now, 'declined', v_now
    )
    ON CONFLICT (assignment_id, driver_id, tier) DO UPDATE
    SET status = 'declined',
        responded_at = v_now
    RETURNING id INTO v_updated_offer_id;
  END IF;

  -- Incrementar streak de recusa; aplicar cooldown ao atingir threshold
  v_streak := v_streak + 1;
  IF v_streak >= v_threshold THEN
    v_cooldown_until := v_now + make_interval(mins => v_cooldown_min);
    UPDATE public.delivery_drivers
    SET reject_streak = 0,
        cooldown_until = v_cooldown_until,
        updated_at = v_now
    WHERE user_id = v_user;
  ELSE
    UPDATE public.delivery_drivers
    SET reject_streak = v_streak,
        updated_at = v_now
    WHERE user_id = v_user;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'offer_id', v_updated_offer_id,
    'reject_streak', CASE WHEN v_cooldown_until IS NOT NULL THEN 0 ELSE v_streak END,
    'cooldown_until', v_cooldown_until,
    'cooldown_applied', v_cooldown_until IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_delivery_offer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_delivery_offer(uuid, uuid) TO authenticated;

-- 4. RPC authorize_delivery_bonus (bônus autorizado manualmente pelo parceiro — §7.4)
CREATE OR REPLACE FUNCTION public.authorize_delivery_bonus(
  p_assignment_id uuid,
  p_amount        numeric,
  p_reason        text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_actor uuid := COALESCE(p_actor_user_id, auth.uid());
  v_assignment public.delivery_assignments%ROWTYPE;
  v_clean_reason text := NULLIF(LEFT(TRIM(COALESCE(p_reason, '')), 300), '');
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'invalid_bonus_amount';
  END IF;

  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_assignment_not_found';
  END IF;

  IF v_assignment.status NOT IN ('available', 'requested', 'assigned') OR v_assignment.driver_id IS NOT NULL THEN
    RAISE EXCEPTION 'delivery_assignment_not_available';
  END IF;

  -- Atualiza bônus e reinicia ladder caso estivesse exaurido
  UPDATE public.delivery_assignments
  SET bonus_amount = ROUND(p_amount, 2),
      bonus_authorized_by = v_actor,
      bonus_authorized_at = v_now,
      bonus_reason = v_clean_reason,
      dispatch_started_at = v_now,
      dispatch_tier = 0,
      dispatch_exhausted_at = NULL,
      dispatch_exhausted_reason = NULL,
      updated_at = v_now
  WHERE id = v_assignment.id;

  -- Registrar bônus em linha própria no orders.delivery_breakdown sem mexer em orders.delivery_fee
  UPDATE public.orders
  SET delivery_breakdown = COALESCE(delivery_breakdown, '{}'::jsonb) || jsonb_build_object(
    'deliveryBonus', ROUND(p_amount, 2),
    'deliveryBonusReason', v_clean_reason,
    'deliveryBonusAuthorizedAt', v_now
  )
  WHERE id = v_assignment.order_id
    AND partner_id = v_assignment.partner_id;

  -- Reabrir ofertas para entregadores que não aceitaram antes
  UPDATE public.delivery_offers
  SET status = 'superseded'
  WHERE assignment_id = v_assignment.id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'bonus_amount', ROUND(p_amount, 2),
    'delivery_fee', v_assignment.delivery_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_delivery_bonus(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_delivery_bonus(uuid, numeric, text, uuid) TO service_role;
