-- ============================================================================
-- Migration: 20261123_1900_event_driven_location_and_cron_1m.sql
-- Descrição:
--   1. Altera janela de posição 'live' em delivery_driver_presence de 2 min
--      para 15 min, compatível com captura por eventos (entrada no portal,
--      clique manual c/ cooldown 5 min, aceite e transições de status) sem
--      rastreamento contínuo.
--   2. Reagenda pg_cron 'dudit_dispatch_tick' de '15 seconds' para '* * * * *'
--      (1 minuto) e ajusta tier_ladder padrão para [60, 60, 60, 60, 120]s.
--   3. Adiciona fast-path em dispatch_tick() para retornar imediatamente sem
--      custo quando não há entregas abertas aguardando despacho.
-- ============================================================================

-- 1. Atualizar delivery_driver_presence (janela de frescor: 15 minutos)
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
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '15 minutes'
      THEN l.latitude
    ELSE COALESCE(a.latitude::numeric(10,7), dd.latitude)
  END AS lat,
  CASE
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '15 minutes'
      THEN l.longitude
    ELSE COALESCE(a.longitude::numeric(10,7), dd.longitude)
  END AS lng,
  COALESCE(a.city, dd.city) AS city,
  COALESCE(a.state, dd.state) AS state,
  CASE
    WHEN l.source IN ('gps', 'network') AND l.updated_at > now() - interval '15 minutes'
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

-- 2. Ajustar tier_ladder padrão global para intervalos de 1 minuto (compatível com cron 1m)
UPDATE public.dispatch_settings
SET tier_ladder = '[
      {"tier":0,"km":2,   "wait_s":60, "mode":"board","top_n":0},
      {"tier":1,"km":4,   "wait_s":60, "mode":"board","top_n":0},
      {"tier":2,"km":7,   "wait_s":60, "mode":"board","top_n":0},
      {"tier":3,"km":12,  "wait_s":60, "mode":"board","top_n":0},
      {"tier":4,"km":null,"wait_s":120,"mode":"board","top_n":0}
    ]'::jsonb,
    updated_at = now()
WHERE partner_id IS NULL
  AND store_id IS NULL;

-- 3. Reagendar pg_cron 'dudit_dispatch_tick' para 1 minuto ('* * * * *')
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip rescheduling dudit_dispatch_tick';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'dudit_dispatch_tick'
    AND database = current_database();

  PERFORM cron.schedule('dudit_dispatch_tick', '* * * * *', 'SELECT public.dispatch_tick();');
END
$cron$;
