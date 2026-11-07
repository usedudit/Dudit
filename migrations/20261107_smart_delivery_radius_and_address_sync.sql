-- ============================================================================
-- Migration: Smart Delivery Driver Radius & Real-time Address Synchronization
-- ============================================================================
-- 1. Cria helper geodésico Haversine de alta precisão
-- 2. Cria trigger de sincronização automática entre addresses e delivery_drivers
-- 3. Atualiza get_available_delivery_offers com cálculo de raio em KM (estilo iFood),
--    detecção por coordenadas (raio de 20km) com fallback inteligente por cidade,
--    resolução de endereço do entregador pelo perfil/endereço padrão e remoção
--    da trava de 3 minutos para solicitações abertas da rede Dudit.
-- ============================================================================

-- 1. Helper function: haversine_distance_km
CREATE OR REPLACE FUNCTION public.haversine_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN NULL
    WHEN lat1 = lat2 AND lon1 = lon2 THEN 0.0
    ELSE ROUND((
      6371.0 * 2.0 * asin(
        sqrt(
          power(sin(radians((lat2 - lat1) / 2.0)), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) *
          power(sin(radians((lon2 - lon1) / 2.0)), 2)
        )
      )
    )::numeric, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.haversine_distance_km(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.haversine_distance_km(
    lat1::double precision,
    lon1::double precision,
    lat2::double precision,
    lon2::double precision
  );
$$;

-- 2. Trigger function: sincronização automática de endereço de perfil para delivery_drivers
CREATE OR REPLACE FUNCTION public.sync_user_address_to_delivery_drivers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND (
    NEW.is_default = true
    OR NOT EXISTS (
      SELECT 1 FROM public.addresses
      WHERE user_id = NEW.user_id AND is_default = true AND id <> NEW.id
    )
  ) THEN
    UPDATE public.delivery_drivers
    SET city = COALESCE(NEW.city, city),
        neighborhood = COALESCE(NEW.neighborhood, neighborhood),
        street = COALESCE(NEW.street, street),
        number = COALESCE(NEW.number, number),
        complement = COALESCE(NEW.complement, complement),
        state = COALESCE(NEW.state, state),
        zip_code = COALESCE(NEW.zip_code, zip_code),
        latitude = COALESCE(NEW.latitude, latitude),
        longitude = COALESCE(NEW.longitude, longitude),
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_address_to_delivery_drivers ON public.addresses;
CREATE TRIGGER trg_sync_user_address_to_delivery_drivers
AFTER INSERT OR UPDATE ON public.addresses
FOR EACH ROW
WHEN (NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.sync_user_address_to_delivery_drivers();

-- Sincroniza retroativamente os entregadores já existentes com seu endereço padrão de addresses
UPDATE public.delivery_drivers dd
SET city = COALESCE(a.city, dd.city),
    neighborhood = COALESCE(a.neighborhood, dd.neighborhood),
    street = COALESCE(a.street, dd.street),
    number = COALESCE(a.number, dd.number),
    complement = COALESCE(a.complement, dd.complement),
    state = COALESCE(a.state, dd.state),
    zip_code = COALESCE(a.zip_code, dd.zip_code),
    latitude = COALESCE(a.latitude, dd.latitude),
    longitude = COALESCE(a.longitude, dd.longitude),
    updated_at = now()
FROM (
  SELECT DISTINCT ON (user_id)
    user_id, city, neighborhood, street, number, complement, state, zip_code, latitude, longitude
  FROM public.addresses
  WHERE user_id IS NOT NULL
  ORDER BY user_id, is_default DESC, updated_at DESC
) a
WHERE dd.user_id = a.user_id;

-- 3. Atualizar RPC get_available_delivery_offers
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
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 1. Verificar se o entregador está cadastrado e ativo
  SELECT is_active, availability_status, city, neighborhood, street, number, complement, state, zip_code, latitude, longitude
  INTO v_is_active, v_availability_status, v_driver_city, v_driver_neighborhood, v_driver_street, v_driver_number, v_driver_complement, v_driver_state, v_driver_zip, v_driver_lat, v_driver_lon
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;

  -- 2. Resolver localização do entregador priorizando o endereço ativo/padrão do perfil em addresses
  SELECT city, neighborhood, street, number, complement, state, zip_code, latitude, longitude
  INTO v_driver_city, v_driver_neighborhood, v_driver_street, v_driver_number, v_driver_complement, v_driver_state, v_driver_zip, v_driver_lat, v_driver_lon
  FROM public.addresses
  WHERE user_id = v_user
  ORDER BY is_default DESC, updated_at DESC
  LIMIT 1;

  -- Se o endereço do perfil for encontrado, mantém delivery_drivers sincronizado
  IF v_driver_city IS NOT NULL OR v_driver_lat IS NOT NULL THEN
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
        OR latitude IS DISTINCT FROM v_driver_lat
        OR longitude IS DISTINCT FROM v_driver_lon
      );
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
      c.name AS raw_customer_name,
      sa.city AS store_city,
      sa.latitude AS store_lat,
      sa.longitude AS store_lon,
      dist.dist_km AS pickup_distance_km
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
    LEFT JOIN LATERAL (
      SELECT a.city, a.latitude, a.longitude, a.street, a.number, a.neighborhood
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
    CROSS JOIN LATERAL (
      SELECT public.haversine_distance_km(v_driver_lat, v_driver_lon, sa.latitude, sa.longitude) AS dist_km
    ) dist
    WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
      AND da.assigned_at >= (now() - interval '15 minutes')
      AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
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
      -- Raio de Atendimento e Detecção Inteligente:
      -- 1. Se ambos têm coordenadas geocodificadas: raio de 20 km entre o entregador e a loja de coleta
      -- 2. Fallback: mesma cidade ou cidade mencionada no endereço de entrega
      AND (
        (dist.dist_km IS NOT NULL AND dist.dist_km <= 20.0)
        OR (
          (dist.dist_km IS NULL OR v_driver_lat IS NULL OR sa.latitude IS NULL)
          AND (
            v_driver_city IS NULL
            OR v_driver_city = ''
            OR LOWER(TRIM(COALESCE(sa.city, ''))) = LOWER(TRIM(v_driver_city))
            OR (o.delivery_address ILIKE '%' || v_driver_city || '%')
          )
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
      COALESCE((
        SELECT SUM(da2.delivery_fee)
        FROM public.delivery_assignments da2
        WHERE (dto.delivery_id IS NOT NULL AND da2.delivery_id = dto.delivery_id)
           OR (dto.delivery_id IS NULL AND da2.id = dto.id)
      ), dto.raw_fee) AS delivery_fee,
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
      COALESCE(c_primary.name, dto.raw_customer_name, 'Cliente') AS customer_name,
      COALESCE(c_primary.phone, '') AS customer_phone,
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
          'customer_name', COALESCE(c_inner.name, o_inner.customer_name, 'Cliente'),
          'customer_phone', COALESCE(c_inner.phone, ''),
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
        LEFT JOIN public.customers c_inner ON c_inner.id = o_inner.buyer_id AND c_inner.partner_id = o_inner.partner_id
        WHERE do_inner.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), '[]'::jsonb) AS orders
    FROM distinct_offers dto
    JOIN public.orders o_primary ON o_primary.id = dto.order_id AND o_primary.partner_id = dto.partner_id
    JOIN public.partners p ON p.id = dto.partner_id
    LEFT JOIN public.stores s ON s.id = o_primary.store_id
    LEFT JOIN public.customers c_primary ON c_primary.id = o_primary.buyer_id AND c_primary.partner_id = o_primary.partner_id
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
