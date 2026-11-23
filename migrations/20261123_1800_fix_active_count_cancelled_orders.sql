-- ============================================================================
-- Migration: 20261123_1800_fix_active_count_cancelled_orders.sql
-- Descrição:
--   1. Cancela assignments órfãos cujo pedido já está com situation='cancelled'
--      ou delivery_status='cancelled' (evita travar capacity_orders do entregador).
--   2. Atualiza delivery_driver_presence, accept_delivery_offer e
--      get_my_delivery_dashboard para ignorar na contagem de active_count
--      qualquer assignment cujo pedido já foi cancelado ou entregue.
-- ============================================================================

-- 1. Limpar assignments órfãos de pedidos já cancelados
UPDATE public.delivery_assignments da
SET status = 'cancelled',
    cancelled_at = COALESCE(da.cancelled_at, now()),
    failure_reason = COALESCE(da.failure_reason, 'Pedido cancelado'),
    updated_at = now()
FROM public.orders o
WHERE o.id = da.order_id
  AND da.status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery')
  AND (o.situation = 'cancelled' OR o.delivery_status = 'cancelled');

-- 2. Atualizar delivery_driver_presence para ignorar pedidos cancelados/entregues no active_count
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
  JOIN public.orders o ON o.id = da.order_id
  WHERE da.driver_id = dd.user_id
    AND da.status IN ('accepted', 'picked_up', 'out_for_delivery')
    AND COALESCE(o.situation, '') <> 'cancelled'
    AND COALESCE(o.delivery_status, '') NOT IN ('delivered', 'cancelled')
) act ON true;

GRANT SELECT ON public.delivery_driver_presence TO authenticated, service_role;

-- 3. Atualizar get_my_delivery_dashboard com a mesma regra consistente
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

  SELECT count(*) FILTER (
           WHERE da.status IN ('assigned', 'accepted')
             AND COALESCE(o.situation, '') <> 'cancelled'
             AND COALESCE(o.delivery_status, '') NOT IN ('delivered', 'cancelled')
         ),
         count(*) FILTER (
           WHERE da.status IN ('picked_up', 'out_for_delivery')
             AND COALESCE(o.situation, '') <> 'cancelled'
             AND COALESCE(o.delivery_status, '') NOT IN ('delivered', 'cancelled')
         ),
         count(*) FILTER (WHERE da.status = 'delivered')
    INTO v_pending, v_in_progress, v_completed
  FROM public.delivery_assignments da
  LEFT JOIN public.orders o ON o.id = da.order_id
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
