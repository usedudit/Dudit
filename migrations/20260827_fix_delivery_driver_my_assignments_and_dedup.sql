-- Migration: 20260827_fix_delivery_driver_my_assignments_and_dedup.sql
-- Descrição:
-- 1. Corrige get_my_delivery_assignments para agrupar atribuições por delivery_id (evitando duplicações em "Minhas Entregas")
-- 2. Consolida soma de valores e taxas de pedidos em rota agrupada
-- 3. Retorna order_count e status consolidado real (se a entrega foi cancelada no ERP, reflete como cancelled)

DROP FUNCTION IF EXISTS public.get_my_delivery_assignments(text, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignments(text, integer, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignments;

CREATE OR REPLACE FUNCTION public.get_my_delivery_assignments(
  p_bucket text DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_before_assigned_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  delivery_id uuid,
  order_id uuid,
  partner_id uuid,
  status text,
  assigned_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  out_for_delivery_at timestamptz,
  completed_at timestamptz,
  delivery_fee numeric,
  failure_reason text,
  order_number text,
  order_count bigint,
  partner_name text,
  store_name text,
  store_phone text,
  store_logo_url text,
  store_address text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  total_amount numeric,
  payment_method text,
  payment_status text,
  notes text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH raw_assignments AS (
    SELECT DISTINCT ON (COALESCE(da.delivery_id, da.id))
      da.id AS assignment_id,
      da.delivery_id,
      da.order_id,
      da.partner_id,
      -- Reflete cancelamento no ERP de forma consistente
      CASE
        WHEN d.status = 'cancelled' THEN 'cancelled'
        WHEN d.status = 'delivered' THEN 'delivered'
        ELSE da.status
      END AS status,
      da.assigned_at,
      da.accepted_at,
      da.picked_up_at,
      da.out_for_delivery_at,
      da.completed_at,
      -- Soma das taxas de entrega agrupadas
      COALESCE((
        SELECT SUM(da_sub.delivery_fee)
        FROM public.delivery_assignments da_sub
        WHERE (da.delivery_id IS NOT NULL AND da_sub.delivery_id = da.delivery_id) OR da_sub.id = da.id
      ), da.delivery_fee) AS delivery_fee,
      da.failure_reason,
      da.notes,
      o.order_number,
      o.store_id,
      o.buyer_id,
      COALESCE(NULLIF(o.customer_name, ''), 'Cliente') AS raw_customer_name,
      o.delivery_address,
      -- Soma dos valores totais dos pedidos da rota
      COALESCE((
        SELECT SUM(o2.total_amount)
        FROM public.delivery_orders do_sum
        JOIN public.orders o2 ON o2.id = do_sum.order_id
        WHERE do_sum.delivery_id = da.delivery_id AND da.delivery_id IS NOT NULL
      ), o.total_amount) AS total_amount,
      o.payment_method,
      o.situation AS payment_status,
      COALESCE((
        SELECT count(*)
        FROM public.delivery_orders do_cnt
        WHERE do_cnt.delivery_id = da.delivery_id AND da.delivery_id IS NOT NULL
      ), 1::bigint) AS order_count
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    LEFT JOIN public.deliveries d ON d.id = da.delivery_id
    WHERE da.driver_id = auth.uid()
    ORDER BY COALESCE(da.delivery_id, da.id), da.assigned_at DESC, da.id DESC
  )
  SELECT
    ra.assignment_id,
    ra.delivery_id,
    ra.order_id,
    ra.partner_id,
    ra.status,
    ra.assigned_at,
    ra.accepted_at,
    ra.picked_up_at,
    ra.out_for_delivery_at,
    ra.completed_at,
    ra.delivery_fee,
    ra.failure_reason,
    ra.order_number,
    ra.order_count,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
    COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
    COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
    COALESCE(
      (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = ra.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
      ''
    ) AS store_address,
    COALESCE(NULLIF(ra.raw_customer_name, ''), c.name, 'Cliente') AS customer_name,
    COALESCE(c.phone, '') AS customer_phone,
    ra.delivery_address,
    ra.total_amount,
    ra.payment_method,
    ra.payment_status,
    ra.notes,
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
      WHERE (ra.delivery_id IS NOT NULL AND oi.order_id IN (SELECT do_i.order_id FROM public.delivery_orders do_i WHERE do_i.delivery_id = ra.delivery_id))
         OR (ra.delivery_id IS NULL AND oi.order_id = ra.order_id)
    ), '[]'::jsonb) AS items
  FROM raw_assignments ra
  JOIN public.partners p ON p.id = ra.partner_id
  LEFT JOIN public.stores s ON s.id = ra.store_id
  LEFT JOIN public.customers c ON c.id = ra.buyer_id AND c.partner_id = ra.partner_id
  WHERE (
    p_bucket = 'all' OR
    (p_bucket = 'pending' AND ra.status IN ('assigned', 'accepted')) OR
    (p_bucket = 'in_progress' AND ra.status IN ('picked_up', 'out_for_delivery')) OR
    (p_bucket = 'completed' AND ra.status = 'delivered') OR
    (p_bucket = 'cancelled' AND ra.status = 'cancelled') OR
    (p_bucket = 'failed' AND ra.status = 'failed')
  )
  AND (
    p_before_assigned_at IS NULL OR
    ra.assigned_at < p_before_assigned_at OR
    (ra.assigned_at = p_before_assigned_at AND ra.assignment_id < p_before_id)
  )
  ORDER BY ra.assigned_at DESC, ra.assignment_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.get_my_delivery_assignments(text, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_assignments(text, integer, timestamptz, uuid) TO authenticated;
