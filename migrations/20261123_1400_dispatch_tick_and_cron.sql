-- ============================================================================
-- Migration: 20261123_1400_dispatch_tick_and_cron.sql
-- Descrição (Fase 2b — Motor de despacho com escalada board-first + pg_cron):
--   1. Cria public.dispatch_score(...) lendo pesos da tabela dispatch_settings.
--   2. Cria public.dispatch_tick() idempotente com advisory lock, escalada por
--      tiers, teto econômico de raio (R$/km §4.5), emissão em delivery_offers
--      e telemetria em delivery_dispatch_events.
--   3. Agenda job pg_cron 'dudit_dispatch_tick' (15s com fallback 1 min),
--      protegido por verificação em pg_extension.
-- ============================================================================

-- 1. Função de score (§4.3 — pesos sempre vindos de dispatch_settings)
CREATE OR REPLACE FUNCTION public.dispatch_score(
  p_pickup_minutes      numeric,
  p_detour_minutes      numeric DEFAULT 0,
  p_acceptance_rate     numeric DEFAULT 0.85,
  p_deliveries_today    integer DEFAULT 0,
  p_active_count        integer DEFAULT 0,
  p_capacity            integer DEFAULT 1,
  p_min_since_last_offer numeric DEFAULT 60,
  p_weights             jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  w_pickup     numeric := COALESCE((p_weights->>'pickup')::numeric,     0.40);
  w_detour     numeric := COALESCE((p_weights->>'detour')::numeric,     0.20);
  w_acceptance numeric := COALESCE((p_weights->>'acceptance')::numeric, 0.15);
  w_fairness   numeric := COALESCE((p_weights->>'fairness')::numeric,   0.10);
  w_idle       numeric := COALESCE((p_weights->>'idle')::numeric,       0.10);
  w_starvation numeric := COALESCE((p_weights->>'starvation')::numeric, 0.05);

  c_pickup     numeric;
  c_detour     numeric;
  c_acceptance numeric;
  c_fairness   numeric;
  c_idle       numeric;
  c_starvation numeric;
  v_total      numeric;
BEGIN
  c_pickup     := 1.0 - LEAST(GREATEST(COALESCE(p_pickup_minutes, 15), 0), 30.0) / 30.0;
  c_detour     := 1.0 - LEAST(GREATEST(COALESCE(p_detour_minutes, 0), 0), 20.0) / 20.0;
  c_acceptance := LEAST(GREATEST(COALESCE(p_acceptance_rate, 0.85), 0.0), 1.0);
  c_fairness   := 1.0 - LEAST(GREATEST(COALESCE(p_deliveries_today, 0), 0), 12.0) / 12.0;
  c_idle       := 1.0 - LEAST(GREATEST(COALESCE(p_active_count, 0)::numeric / GREATEST(COALESCE(p_capacity, 1), 1), 0.0), 1.0);
  c_starvation := 1.0 - LEAST(GREATEST(COALESCE(p_min_since_last_offer, 60), 0), 60.0) / 60.0;

  v_total := ROUND((
    w_pickup     * c_pickup +
    w_detour     * c_detour +
    w_acceptance * c_acceptance +
    w_fairness   * c_fairness +
    w_idle       * c_idle +
    w_starvation * c_starvation
  )::numeric, 4);

  RETURN jsonb_build_object(
    'score', v_total,
    'breakdown', jsonb_build_object(
      'pickup',     ROUND(c_pickup, 4),
      'detour',     ROUND(c_detour, 4),
      'acceptance', ROUND(c_acceptance, 4),
      'fairness',   ROUND(c_fairness, 4),
      'idle',       ROUND(c_idle, 4),
      'starvation', ROUND(c_starvation, 4)
    )
  );
END;
$$;

-- 2. Motor de despacho idempotente dispatch_tick()
CREATE OR REPLACE FUNCTION public.dispatch_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_now                 timestamptz := now();
  v_hour                integer := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::integer;
  v_processed           integer := 0;
  v_total_offers        integer := 0;
  v_total_exhausted     integer := 0;
  v_rec                 record;
  v_cfg                 public.dispatch_settings%ROWTYPE;
  v_store_max_km        numeric;
  v_store_lat           numeric;
  v_store_lon           numeric;
  v_delivery_km         numeric;
  v_start_ms            double precision;
  v_took_ms             integer;
  v_age_s               numeric;
  v_cum_wait            numeric;
  v_total_ladder_wait   numeric;
  v_tier_elem           jsonb;
  v_target_tier         smallint;
  v_target_tier_cfg     jsonb;
  v_max_tier            smallint;
  v_tier_km             numeric;
  v_tier_wait_s         integer;
  v_tier_mode           text;
  v_tier_top_n          integer;
  v_taxa_disponivel     numeric;
  v_piso                numeric;
  v_economic_cap_km     numeric;
  v_effective_km        numeric;
  v_tier_changed        boolean;
  v_candidates          integer;
  v_eligible            integer;
  v_offers_created      integer;
  v_pending_count       integer;
  v_drivers_in_store_km integer;
  v_nearest_km          numeric;
  v_suggested_fee       numeric;
  v_outcome             text;
  v_last_logged_outcome text;
  v_last_logged_tier    smallint;
  v_expires_at          timestamptz;
BEGIN
  -- Evita execuções simultâneas do tick em paralelo
  IF NOT pg_try_advisory_xact_lock(hashtext('dudit_dispatch_tick')) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'lock_busy');
  END IF;

  -- 1. Expirar ofertas vencidas globalmente
  UPDATE public.delivery_offers
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < v_now;

  -- 2. Processar cada assignment aberto (1 por entrega/assignment)
  FOR v_rec IN
    SELECT DISTINCT ON (COALESCE(da.delivery_id, da.id))
      da.id,
      da.order_id,
      da.delivery_id,
      da.partner_id,
      da.delivery_fee,
      COALESCE(da.bonus_amount, 0) AS bonus_amount,
      da.dispatch_started_at,
      da.dispatch_tier,
      o.store_id,
      o.package_weight_kg,
      o.package_volume_l,
      o.delivery_breakdown
    FROM public.delivery_assignments da
    JOIN public.orders o
      ON o.id = da.order_id
     AND o.partner_id = da.partner_id
    WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
      AND da.driver_id IS NULL
      AND da.dispatch_exhausted_at IS NULL
      AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = da.delivery_id
          AND d.status IN ('sent', 'delivered', 'cancelled')
      )
    ORDER BY COALESCE(da.delivery_id, da.id), da.assigned_at DESC, da.id DESC
  LOOP
    v_start_ms := EXTRACT(EPOCH FROM clock_timestamp()) * 1000.0;
    v_processed := v_processed + 1;
    v_tier_changed := false;
    v_offers_created := 0;
    v_suggested_fee := NULL;

    -- Inicializar relógio do despacho se primeira passagem
    IF v_rec.dispatch_started_at IS NULL THEN
      UPDATE public.delivery_assignments
      SET dispatch_started_at = v_now,
          dispatch_tier = 0,
          updated_at = v_now
      WHERE id = v_rec.id;
      v_rec.dispatch_started_at := v_now;
      v_rec.dispatch_tier := 0;
      v_tier_changed := true;
    END IF;

    -- Resolver configuração (loja → parceiro → global)
    SELECT * INTO v_cfg
    FROM public.dispatch_settings ds
    WHERE (v_rec.store_id IS NOT NULL AND ds.store_id = v_rec.store_id AND ds.partner_id = v_rec.partner_id)
       OR (ds.store_id IS NULL AND ds.partner_id = v_rec.partner_id)
       OR (ds.partner_id IS NULL AND ds.store_id IS NULL)
    ORDER BY
      CASE
        WHEN v_rec.store_id IS NOT NULL AND ds.store_id = v_rec.store_id THEN 1
        WHEN ds.partner_id = v_rec.partner_id THEN 2
        ELSE 3
      END
    LIMIT 1;

    -- Resolver teto de distância da loja (delivery_settings)
    SELECT COALESCE(ds.max_delivery_km, v_cfg.max_pickup_km, 20.0)
    INTO v_store_max_km
    FROM public.delivery_settings ds
    WHERE (v_rec.store_id IS NOT NULL AND ds.store_id = v_rec.store_id)
       OR (ds.store_id IS NULL AND ds.partner_id = v_rec.partner_id)
    ORDER BY
      CASE WHEN v_rec.store_id IS NOT NULL AND ds.store_id = v_rec.store_id THEN 1 ELSE 2 END
    LIMIT 1;
    v_store_max_km := COALESCE(v_store_max_km, v_cfg.max_pickup_km, 20.0);

    -- Resolver coordenadas da loja
    SELECT a.latitude, a.longitude
    INTO v_store_lat, v_store_lon
    FROM public.addresses a
    WHERE a.store_id = v_rec.store_id
       OR (v_rec.store_id IS NULL AND a.partner_id = v_rec.partner_id)
       OR a.partner_id = v_rec.partner_id
    ORDER BY
      CASE WHEN a.store_id = v_rec.store_id AND a.is_default = true THEN 1
           WHEN a.store_id = v_rec.store_id THEN 2
           WHEN a.is_default = true THEN 3
           ELSE 4 END,
      a.created_at ASC
    LIMIT 1;

    -- Distância loja → cliente (quando registrada no delivery_breakdown)
    v_delivery_km := CASE
      WHEN (v_rec.delivery_breakdown->>'distanceKm') ~ '^[0-9]+(\.[0-9]+)?$'
        AND (v_rec.delivery_breakdown->>'distanceKm')::numeric > 0
      THEN ROUND((v_rec.delivery_breakdown->>'distanceKm')::numeric, 2)
      ELSE NULL
    END;

    -- Calcular tier alvo pela idade do despacho
    v_age_s := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_rec.dispatch_started_at)));
    v_cum_wait := 0;
    v_total_ladder_wait := 0;
    v_target_tier := 0;
    v_target_tier_cfg := NULL;
    v_max_tier := 0;

    FOR v_tier_elem IN
      SELECT elem
      FROM jsonb_array_elements(v_cfg.tier_ladder) AS elem
      ORDER BY (elem->>'tier')::smallint ASC
    LOOP
      v_max_tier := (v_tier_elem->>'tier')::smallint;
      IF v_age_s >= v_cum_wait THEN
        v_target_tier := v_max_tier;
        v_target_tier_cfg := v_tier_elem;
      END IF;
      v_cum_wait := v_cum_wait + COALESCE((v_tier_elem->>'wait_s')::numeric, 45);
      v_total_ladder_wait := v_cum_wait;
    END LOOP;

    IF v_target_tier_cfg IS NULL THEN
      v_target_tier_cfg := '{"tier":0,"km":20,"wait_s":60,"mode":"board","top_n":0}'::jsonb;
    END IF;

    v_tier_wait_s := GREATEST(COALESCE((v_target_tier_cfg->>'wait_s')::integer, 45), 15);
    v_tier_mode   := COALESCE(v_target_tier_cfg->>'mode', 'board');
    v_tier_top_n  := COALESCE((v_target_tier_cfg->>'top_n')::integer, 0);

    -- Avançou de tier: supersede ofertas pendentes do tier anterior
    IF v_target_tier > v_rec.dispatch_tier THEN
      UPDATE public.delivery_offers
      SET status = 'superseded'
      WHERE assignment_id = v_rec.id
        AND status = 'pending';

      UPDATE public.delivery_assignments
      SET dispatch_tier = v_target_tier,
          updated_at = v_now
      WHERE id = v_rec.id;

      v_rec.dispatch_tier := v_target_tier;
      v_tier_changed := true;
    END IF;

    -- Calcular teto econômico (§4.5): min(store_max_km, taxa_disponivel / piso_rs_por_km)
    SELECT COALESCE(
      (SELECT SUM(da2.delivery_fee + COALESCE(da2.bonus_amount, 0))
       FROM public.delivery_assignments da2
       WHERE (v_rec.delivery_id IS NOT NULL AND da2.delivery_id = v_rec.delivery_id)
          OR (v_rec.delivery_id IS NULL AND da2.id = v_rec.id)),
      COALESCE(v_rec.delivery_fee, 0) + COALESCE(v_rec.bonus_amount, 0)
    ) INTO v_taxa_disponivel;

    v_piso := COALESCE(v_cfg.piso_rs_por_km, 1.20);
    IF v_taxa_disponivel > 0 AND v_piso > 0 THEN
      v_economic_cap_km := ROUND(v_taxa_disponivel / v_piso, 2);
    ELSE
      v_economic_cap_km := v_store_max_km;
    END IF;

    v_tier_km := CASE
      WHEN v_target_tier_cfg->>'km' IS NULL OR v_target_tier_cfg->>'km' = 'null'
      THEN LEAST(v_store_max_km, v_economic_cap_km)
      ELSE LEAST((v_target_tier_cfg->>'km')::numeric, v_store_max_km, v_economic_cap_km)
    END;
    v_effective_km := GREATEST(COALESCE(v_tier_km, 0), 0);

    -- Janela de expiração da oferta neste tier
    v_expires_at := v_now + make_interval(secs => v_tier_wait_s);

    -- Contar candidatos no raio efetivo e emitir ofertas ordenadas por dispatch_score
    v_candidates := 0;
    v_eligible := 0;

    IF v_store_lat IS NOT NULL AND v_store_lon IS NOT NULL THEN
      WITH base_candidates AS (
        SELECT
          dp.user_id AS driver_id,
          dp.vehicle_type,
          dp.capacity_orders,
          dp.active_count,
          public.haversine_distance_km(dp.lat, dp.lng, v_store_lat, v_store_lon) AS straight_km
        FROM public.delivery_driver_presence dp
        WHERE dp.is_active = true
          AND dp.availability_status = 'available'
          AND (dp.cooldown_until IS NULL OR dp.cooldown_until < v_now)
          AND dp.active_count < GREATEST(COALESCE(dp.capacity_orders, 1), 1)
          AND dp.position_quality <> 'unknown'
          AND dp.lat IS NOT NULL
          AND dp.lng IS NOT NULL
          -- Respeita vínculo dedicado se existir; senão rede aberta
          AND (
            NOT EXISTS (
              SELECT 1 FROM public.delivery_driver_partners ddp_any
              WHERE ddp_any.driver_id = dp.user_id AND ddp_any.is_active = true
            )
            OR EXISTS (
              SELECT 1 FROM public.delivery_driver_partners ddp
              WHERE ddp.driver_id = dp.user_id
                AND ddp.partner_id = v_rec.partner_id
                AND ddp.is_active = true
            )
          )
          -- Não reenviar para entregador que já recusou este assignment
          AND NOT EXISTS (
            SELECT 1 FROM public.delivery_offers dof_dec
            WHERE dof_dec.assignment_id = v_rec.id
              AND dof_dec.driver_id = dp.user_id
              AND dof_dec.status = 'declined'
          )
          -- Compatibilidade de veículo
          AND public.vehicle_compatible(dp.vehicle_type, v_rec.package_weight_kg, v_rec.package_volume_l)
      ),
      in_radius AS (
        SELECT
          bc.*,
          public.estimate_road_km(bc.straight_km, v_cfg.circuity_factor) AS pickup_km
        FROM base_candidates bc
        WHERE bc.straight_km IS NOT NULL
          AND bc.straight_km <= v_effective_km
      ),
      driver_metrics AS (
        SELECT
          ir.*,
          public.estimate_travel_min(ir.pickup_km, ir.vehicle_type, v_hour) AS pickup_minutes,
          public.estimate_travel_min(v_delivery_km, ir.vehicle_type, v_hour) AS delivery_minutes,
          COALESCE((
            SELECT count(*)::integer
            FROM public.delivery_assignments da_t
            WHERE da_t.driver_id = ir.driver_id
              AND da_t.status = 'delivered'
              AND da_t.completed_at >= date_trunc('day', v_now AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
          ), 0) AS deliveries_today,
          COALESCE((
            SELECT CASE
              WHEN count(*) FILTER (WHERE dof_h.status IN ('accepted', 'declined')) = 0 THEN 0.85
              ELSE (count(*) FILTER (WHERE dof_h.status = 'accepted'))::numeric
                   / (count(*) FILTER (WHERE dof_h.status IN ('accepted', 'declined')))::numeric
            END
            FROM public.delivery_offers dof_h
            WHERE dof_h.driver_id = ir.driver_id
              AND dof_h.created_at >= v_now - interval '30 days'
          ), 0.85) AS acceptance_rate,
          COALESCE((
            SELECT EXTRACT(EPOCH FROM (v_now - MAX(dof_l.created_at))) / 60.0
            FROM public.delivery_offers dof_l
            WHERE dof_l.driver_id = ir.driver_id
          ), 60.0) AS min_since_last_offer
        FROM in_radius ir
      ),
      scored AS (
        SELECT
          dm.*,
          public.dispatch_score(
            dm.pickup_minutes,
            0,
            dm.acceptance_rate,
            dm.deliveries_today,
            dm.active_count,
            dm.capacity_orders,
            dm.min_since_last_offer,
            v_cfg.score_weights
          ) AS score_obj
        FROM driver_metrics dm
      ),
      ranked AS (
        SELECT
          s.*,
          (s.score_obj->>'score')::numeric(8,4) AS score_val,
          s.score_obj->'breakdown' AS score_breakdown,
          ROW_NUMBER() OVER (ORDER BY (s.score_obj->>'score')::numeric DESC, s.pickup_km ASC) AS rn
        FROM scored s
      ),
      selected AS (
        SELECT *
        FROM ranked
        WHERE v_tier_mode = 'board'
           OR v_tier_top_n <= 0
           OR rn <= v_tier_top_n
      ),
      inserted AS (
        INSERT INTO public.delivery_offers (
          assignment_id, driver_id, tier, mode, score, score_breakdown,
          pickup_km, pickup_minutes, delivery_km, delivery_minutes,
          expires_at, status
        )
        SELECT
          v_rec.id,
          sel.driver_id,
          v_target_tier,
          v_tier_mode,
          sel.score_val,
          sel.score_breakdown,
          sel.pickup_km,
          sel.pickup_minutes,
          v_delivery_km,
          sel.delivery_minutes,
          v_expires_at,
          'pending'
        FROM selected sel
        ON CONFLICT (assignment_id, driver_id, tier) DO NOTHING
        RETURNING id
      )
      SELECT
        (SELECT count(*)::integer FROM in_radius),
        (SELECT count(*)::integer FROM selected),
        (SELECT count(*)::integer FROM inserted)
      INTO v_candidates, v_eligible, v_offers_created;

      v_total_offers := v_total_offers + COALESCE(v_offers_created, 0);
    END IF;

    -- Verificar ofertas pendentes atuais
    SELECT count(*)::integer
    INTO v_pending_count
    FROM public.delivery_offers dof
    WHERE dof.assignment_id = v_rec.id
      AND dof.status = 'pending'
      AND dof.expires_at >= v_now;

    -- Determinar outcome e exaustão
    IF v_offers_created > 0 OR v_pending_count > 0 THEN
      v_outcome := 'offered';
    ELSIF v_target_tier >= v_max_tier AND v_age_s >= v_total_ladder_wait THEN
      -- Verificar se o bloqueio foi pelo teto econômico (§4.5)
      v_drivers_in_store_km := 0;
      v_nearest_km := NULL;

      IF v_store_lat IS NOT NULL AND v_store_lon IS NOT NULL AND v_economic_cap_km < v_store_max_km THEN
        SELECT
          count(*)::integer,
          MIN(public.haversine_distance_km(dp.lat, dp.lng, v_store_lat, v_store_lon))
        INTO v_drivers_in_store_km, v_nearest_km
        FROM public.delivery_driver_presence dp
        WHERE dp.is_active = true
          AND dp.availability_status = 'available'
          AND (dp.cooldown_until IS NULL OR dp.cooldown_until < v_now)
          AND dp.active_count < GREATEST(COALESCE(dp.capacity_orders, 1), 1)
          AND dp.position_quality <> 'unknown'
          AND dp.lat IS NOT NULL
          AND dp.lng IS NOT NULL
          AND public.haversine_distance_km(dp.lat, dp.lng, v_store_lat, v_store_lon) <= v_store_max_km;
      END IF;

      IF v_drivers_in_store_km > 0 AND v_nearest_km IS NOT NULL THEN
        v_outcome := 'no_economically_viable_courier';
        v_suggested_fee := CEIL(v_piso * (public.estimate_road_km(v_nearest_km, v_cfg.circuity_factor) + COALESCE(v_delivery_km, 0)));
      ELSE
        v_outcome := 'exhausted';
      END IF;

      UPDATE public.delivery_assignments
      SET dispatch_exhausted_at = v_now,
          dispatch_exhausted_reason = v_outcome,
          updated_at = v_now
      WHERE id = v_rec.id;

      v_total_exhausted := v_total_exhausted + 1;
    ELSE
      v_outcome := 'no_candidate';
    END IF;

    -- Registrar evento de telemetria quando houve mudança de tier, nova oferta ou mudança de outcome
    SELECT e.outcome, e.tier
    INTO v_last_logged_outcome, v_last_logged_tier
    FROM public.delivery_dispatch_events e
    WHERE e.assignment_id = v_rec.id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1;

    IF v_tier_changed
       OR v_offers_created > 0
       OR v_last_logged_outcome IS DISTINCT FROM v_outcome
       OR v_last_logged_tier IS DISTINCT FROM v_target_tier THEN
      v_took_ms := GREATEST(0, ROUND((EXTRACT(EPOCH FROM clock_timestamp()) * 1000.0) - v_start_ms)::integer);
      INSERT INTO public.delivery_dispatch_events (
        assignment_id, partner_id, tier, candidates, eligible, offers_created,
        effective_max_km, economic_cap_km, suggested_fee, outcome, took_ms
      ) VALUES (
        v_rec.id, v_rec.partner_id, v_target_tier, COALESCE(v_candidates, 0),
        COALESCE(v_eligible, 0), COALESCE(v_offers_created, 0),
        v_effective_km, v_economic_cap_km, v_suggested_fee, v_outcome, v_took_ms
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'offers_created', v_total_offers,
    'exhausted', v_total_exhausted,
    'ticked_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_score(numeric, numeric, numeric, integer, integer, integer, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_score(numeric, numeric, numeric, integer, integer, integer, numeric, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dispatch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_tick() TO service_role;

-- 3. Agendar pg_cron 'dudit_dispatch_tick' (15s, com fallback 1 min)
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available - skip scheduling dudit_dispatch_tick';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'dudit_dispatch_tick'
      AND database = current_database()
  ) THEN
    BEGIN
      PERFORM cron.schedule('dudit_dispatch_tick', '15 seconds', 'SELECT public.dispatch_tick();');
    EXCEPTION WHEN OTHERS THEN
      PERFORM cron.schedule('dudit_dispatch_tick', '* * * * *', 'SELECT public.dispatch_tick();');
    END;
  END IF;
END
$cron$;
