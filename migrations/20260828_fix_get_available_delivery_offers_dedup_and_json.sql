-- Migration: Fix get_available_delivery_offers deduplication, JSON aggregation and multi-order grouping
-- Fixes issue where deliveries with multiple orders showed up as separate cards on the driver available deliveries portal.

DROP FUNCTION IF EXISTS public.get_available_delivery_offers(uuid, integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(timestamptz, integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers();

CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_driver_city text;
  v_is_active boolean;
  v_result jsonb;
BEGIN
  -- 1. Obter dados do entregador logado
  SELECT is_active, city INTO v_is_active, v_driver_city
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH partner_links AS (
    SELECT partner_id
    FROM public.delivery_driver_partners
    WHERE driver_id = v_user AND is_active = true
  ),
  distinct_offers AS (
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
      o.store_id,
      o.buyer_id,
      c.name AS raw_customer_name
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
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
      AND (
        v_driver_city IS NULL
        OR v_driver_city = ''
        OR EXISTS (
          SELECT 1 FROM public.addresses sa
          WHERE (sa.store_id = o.store_id OR (o.store_id IS NULL AND sa.partner_id = da.partner_id))
            AND LOWER(TRIM(sa.city)) = LOWER(TRIM(v_driver_city))
        )
        OR (o.delivery_address ILIKE '%' || v_driver_city || '%')
      )
      AND (
        da.assigned_at < (now() - interval '3 minutes')
        OR EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = da.partner_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.delivery_driver_partners ddp
          WHERE ddp.partner_id = da.partner_id AND ddp.is_active = true
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
      CASE WHEN EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = dto.partner_id) THEN 0 ELSE 1 END ASC,
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
