-- ============================================================================
-- Migration: 20261123_1600_ready_time_and_eta_calibration.sql
-- Descrição (Fase 3a — Tempo de preparo por loja e calibração de ETA):
--   1. Cria public.store_ready_estimates (EMA alimentada por
--      picked_up_at - accepted_at reais via trigger em delivery_assignments).
--   2. Cria public.eta_calibration (fator real/previsto por segmento).
--   3. Cria funções public.get_store_ready_min(...) e
--      public.get_eta_calibration_factor(...).
--   4. Atualiza public.estimate_travel_min para aceitar calibração opcional
--      e atualiza public.get_available_delivery_offers para expor
--      estimated_ready_min e segurar ofertas de preparo longo até T-8 min.
-- ============================================================================

-- 1. Tabela store_ready_estimates
CREATE TABLE IF NOT EXISTS public.store_ready_estimates (
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  hour_bucket   smallint NOT NULL CHECK (hour_bucket >= 0 AND hour_bucket <= 23),
  size_bucket   text NOT NULL DEFAULT 'small' CHECK (size_bucket IN ('small', 'medium', 'large')),
  avg_ready_min numeric(6,2) NOT NULL DEFAULT 8.0 CHECK (avg_ready_min >= 0),
  samples       integer NOT NULL DEFAULT 0 CHECK (samples >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, weekday, hour_bucket, size_bucket)
);

ALTER TABLE public.store_ready_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_ready_estimates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.store_ready_estimates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.store_ready_estimates TO authenticated;
GRANT ALL ON TABLE public.store_ready_estimates TO service_role;

DROP POLICY IF EXISTS store_ready_estimates_select_auth ON public.store_ready_estimates;
CREATE POLICY store_ready_estimates_select_auth
  ON public.store_ready_estimates
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Tabela eta_calibration
CREATE TABLE IF NOT EXISTS public.eta_calibration (
  segment    text PRIMARY KEY,
  factor     numeric(5,3) NOT NULL DEFAULT 1.000 CHECK (factor >= 0.500 AND factor <= 3.000),
  samples    integer NOT NULL DEFAULT 0 CHECK (samples >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.eta_calibration (segment, factor, samples)
VALUES ('global', 1.000, 0)
ON CONFLICT (segment) DO NOTHING;

ALTER TABLE public.eta_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eta_calibration FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.eta_calibration FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.eta_calibration TO authenticated;
GRANT ALL ON TABLE public.eta_calibration TO service_role;

DROP POLICY IF EXISTS eta_calibration_select_auth ON public.eta_calibration;
CREATE POLICY eta_calibration_select_auth
  ON public.eta_calibration
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Trigger para atualizar store_ready_estimates quando um pedido é retirado (picked_up_at)
CREATE OR REPLACE FUNCTION public.trg_fn_update_store_ready_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_item_count integer;
  v_size_bucket text;
  v_wait_min numeric;
  v_sp_time timestamp;
  v_weekday smallint;
  v_hour smallint;
BEGIN
  IF NEW.picked_up_at IS NULL OR NEW.accepted_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.picked_up_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_wait_min := EXTRACT(EPOCH FROM (NEW.picked_up_at - NEW.accepted_at)) / 60.0;
  -- Ignora outliers extremos (< 1 min ou > 90 min)
  IF v_wait_min < 1.0 OR v_wait_min > 90.0 THEN
    RETURN NEW;
  END IF;

  SELECT o.store_id INTO v_store_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_store_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 1)::integer INTO v_item_count
  FROM public.order_items oi
  WHERE oi.order_id = NEW.order_id;

  v_size_bucket := CASE
    WHEN v_item_count <= 2 THEN 'small'
    WHEN v_item_count <= 6 THEN 'medium'
    ELSE 'large'
  END;

  v_sp_time := NEW.accepted_at AT TIME ZONE 'America/Sao_Paulo';
  v_weekday := EXTRACT(DOW FROM v_sp_time)::smallint;
  v_hour    := EXTRACT(HOUR FROM v_sp_time)::smallint;

  -- Média móvel exponencial (alpha = 0.25)
  INSERT INTO public.store_ready_estimates (
    store_id, weekday, hour_bucket, size_bucket, avg_ready_min, samples, updated_at
  ) VALUES (
    v_store_id, v_weekday, v_hour, v_size_bucket, ROUND(v_wait_min, 2), 1, now()
  )
  ON CONFLICT (store_id, weekday, hour_bucket, size_bucket) DO UPDATE SET
    avg_ready_min = ROUND((store_ready_estimates.avg_ready_min * 0.75) + (EXCLUDED.avg_ready_min * 0.25), 2),
    samples       = store_ready_estimates.samples + 1,
    updated_at    = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_store_ready_estimate ON public.delivery_assignments;
CREATE TRIGGER trg_update_store_ready_estimate
AFTER UPDATE OF picked_up_at ON public.delivery_assignments
FOR EACH ROW
WHEN (NEW.picked_up_at IS NOT NULL AND OLD.picked_up_at IS NULL)
EXECUTE FUNCTION public.trg_fn_update_store_ready_estimate();

-- 4. Helpers de ready_time e calibração de ETA
CREATE OR REPLACE FUNCTION public.get_store_ready_min(
  p_store_id   uuid,
  p_item_count integer DEFAULT 1
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sp_time timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_weekday smallint := EXTRACT(DOW FROM v_sp_time)::smallint;
  v_hour smallint := EXTRACT(HOUR FROM v_sp_time)::smallint;
  v_size_bucket text := CASE
    WHEN COALESCE(p_item_count, 1) <= 2 THEN 'small'
    WHEN COALESCE(p_item_count, 1) <= 6 THEN 'medium'
    ELSE 'large'
  END;
  v_avg numeric;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.avg_ready_min INTO v_avg
  FROM public.store_ready_estimates s
  WHERE s.store_id = p_store_id
    AND s.weekday = v_weekday
    AND s.hour_bucket = v_hour
    AND s.size_bucket = v_size_bucket
    AND s.samples >= 3
  LIMIT 1;

  IF v_avg IS NULL THEN
    -- Fallback: média da loja naquela hora independente do dia/tamanho (com >= 5 amostras)
    SELECT ROUND(AVG(s.avg_ready_min), 2) INTO v_avg
    FROM public.store_ready_estimates s
    WHERE s.store_id = p_store_id
      AND s.hour_bucket = v_hour
    HAVING SUM(s.samples) >= 5;
  END IF;

  RETURN v_avg;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_eta_calibration_factor(
  p_store_id uuid DEFAULT NULL,
  p_vehicle  text DEFAULT 'moto',
  p_hour     integer DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hour integer := COALESCE(p_hour, EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::integer);
  v_vehicle text := LOWER(TRIM(COALESCE(p_vehicle, 'moto')));
  v_factor numeric;
BEGIN
  SELECT c.factor INTO v_factor
  FROM public.eta_calibration c
  WHERE c.samples >= 5
    AND c.segment IN (
      CASE WHEN p_store_id IS NOT NULL THEN 'store:' || p_store_id::text || ':hour:' || v_hour::text ELSE NULL END,
      'vehicle:' || v_vehicle || ':hour:' || v_hour::text,
      'global'
    )
  ORDER BY
    CASE
      WHEN p_store_id IS NOT NULL AND c.segment = 'store:' || p_store_id::text || ':hour:' || v_hour::text THEN 1
      WHEN c.segment = 'vehicle:' || v_vehicle || ':hour:' || v_hour::text THEN 2
      ELSE 3
    END
  LIMIT 1;

  RETURN COALESCE(v_factor, 1.000);
END;
$$;

-- 5. Atualizar estimate_travel_min para aplicar fator de calibração de ETA automaticamente
CREATE OR REPLACE FUNCTION public.estimate_travel_min(
  p_km      numeric,
  p_vehicle text DEFAULT 'moto',
  p_hour    integer DEFAULT NULL
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
  v_factor numeric;
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

  v_factor := public.get_eta_calibration_factor(NULL, v_vehicle, v_hour);

  RETURN GREATEST(1, ROUND((p_km / v_speed) * 60.0 * v_factor));
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_ready_min(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_ready_min(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_eta_calibration_factor(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_eta_calibration_factor(uuid, text, integer) TO authenticated, service_role;
