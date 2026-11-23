-- ============================================================================
-- Migration: 20261123_1300_dispatch_settings_and_offers.sql
-- Descrição (Fase 2a — Configurações de despacho, ofertas e telemetria):
--   1. Cria public.dispatch_settings (escada de tiers board-first, piso R$/km,
--      pesos do score em tabela, parâmetros de cooldown e handoff).
--   2. Cria public.delivery_offers (verdade da abordagem ao entregador,
--      com UNIQUE(assignment_id, driver_id, tier) para idempotência).
--   3. Cria public.delivery_dispatch_events (telemetria e observabilidade).
--   4. Adiciona colunas de controle de despacho e bônus autorizado pelo
--      parceiro em public.delivery_assignments.
--   5. Aplica ENABLE + FORCE ROW LEVEL SECURITY e REVOKE/GRANT explícitos.
-- ============================================================================

-- 1. Tabela dispatch_settings
CREATE TABLE IF NOT EXISTS public.dispatch_settings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id             uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  store_id               uuid REFERENCES public.stores(id)   ON DELETE CASCADE,
  max_pickup_km          numeric NOT NULL DEFAULT 20 CHECK (max_pickup_km > 0),
  circuity_factor        numeric NOT NULL DEFAULT 1.35 CHECK (circuity_factor >= 1.0),
  piso_rs_por_km         numeric NOT NULL DEFAULT 1.20 CHECK (piso_rs_por_km >= 0),
  piso_rs_por_km_by_vehicle jsonb NOT NULL DEFAULT '{"moto":1.20,"carro":1.60,"bike":1.00,"bicicleta":1.00}'::jsonb,
  score_weights          jsonb NOT NULL DEFAULT '{"pickup":0.40,"detour":0.20,"acceptance":0.15,"fairness":0.10,"idle":0.10,"starvation":0.05}'::jsonb,
  tier_ladder            jsonb NOT NULL DEFAULT '[
    {"tier":0,"km":2,   "wait_s":30,"mode":"board","top_n":0},
    {"tier":1,"km":4,   "wait_s":45,"mode":"board","top_n":0},
    {"tier":2,"km":7,   "wait_s":60,"mode":"board","top_n":0},
    {"tier":3,"km":12,  "wait_s":75,"mode":"board","top_n":0},
    {"tier":4,"km":null,"wait_s":90,"mode":"board","top_n":0}
  ]'::jsonb,
  batch_max_detour_min   integer NOT NULL DEFAULT 5 CHECK (batch_max_detour_min >= 0),
  reject_threshold       integer NOT NULL DEFAULT 3 CHECK (reject_threshold >= 1),
  reject_cooldown_min    integer NOT NULL DEFAULT 15 CHECK (reject_cooldown_min >= 1),
  handoff_min            integer NOT NULL DEFAULT 5 CHECK (handoff_min >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_settings_global_default_idx
  ON public.dispatch_settings ((true))
  WHERE partner_id IS NULL AND store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_settings_partner_default_idx
  ON public.dispatch_settings (partner_id)
  WHERE partner_id IS NOT NULL AND store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_settings_partner_store_idx
  ON public.dispatch_settings (partner_id, store_id)
  WHERE partner_id IS NOT NULL AND store_id IS NOT NULL;

-- Linha padrão global (fallback para qualquer parceiro/loja sem override)
INSERT INTO public.dispatch_settings (partner_id, store_id)
SELECT NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.dispatch_settings WHERE partner_id IS NULL AND store_id IS NULL
);

ALTER TABLE public.dispatch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dispatch_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dispatch_settings TO authenticated;
GRANT ALL ON TABLE public.dispatch_settings TO service_role;

DROP POLICY IF EXISTS dispatch_settings_select_auth ON public.dispatch_settings;
CREATE POLICY dispatch_settings_select_auth
  ON public.dispatch_settings
  FOR SELECT
  TO authenticated
  USING (
    partner_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = dispatch_settings.partner_id
        AND pu.user_id = auth.uid()
    )
  );

-- 2. Tabela delivery_offers
CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id    uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  driver_id        uuid NOT NULL REFERENCES public.delivery_drivers(user_id) ON DELETE CASCADE,
  tier             smallint NOT NULL,
  mode             text NOT NULL DEFAULT 'board' CHECK (mode IN ('board', 'directed')),
  score            numeric(8,4) NOT NULL DEFAULT 0,
  score_breakdown  jsonb,
  pickup_km        numeric,
  pickup_minutes   numeric,
  delivery_km      numeric,
  delivery_minutes numeric,
  expires_at       timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined','expired','superseded')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  responded_at     timestamptz,
  UNIQUE (assignment_id, driver_id, tier)
);

CREATE INDEX IF NOT EXISTS delivery_offers_driver_pending_idx
  ON public.delivery_offers (driver_id, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS delivery_offers_assignment_status_idx
  ON public.delivery_offers (assignment_id, status);

ALTER TABLE public.delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_offers FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_offers TO authenticated;
GRANT ALL ON TABLE public.delivery_offers TO service_role;

DROP POLICY IF EXISTS delivery_offers_select_own_driver ON public.delivery_offers;
CREATE POLICY delivery_offers_select_own_driver
  ON public.delivery_offers
  FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS delivery_offers_select_partner ON public.delivery_offers;
CREATE POLICY delivery_offers_select_partner
  ON public.delivery_offers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_assignments da
      JOIN public.partner_users pu
        ON pu.partner_id = da.partner_id
       AND pu.user_id = auth.uid()
      WHERE da.id = delivery_offers.assignment_id
    )
  );

-- 3. Tabela delivery_dispatch_events
CREATE TABLE IF NOT EXISTS public.delivery_dispatch_events (
  id              bigserial PRIMARY KEY,
  assignment_id   uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  partner_id      uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  tier            smallint NOT NULL,
  candidates      integer NOT NULL DEFAULT 0,
  eligible        integer NOT NULL DEFAULT 0,
  offers_created  integer NOT NULL DEFAULT 0,
  effective_max_km numeric,
  economic_cap_km numeric,
  suggested_fee   numeric(10,2),
  outcome         text NOT NULL,
  took_ms         integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_dispatch_events_assignment_idx
  ON public.delivery_dispatch_events (assignment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_dispatch_events_partner_created_idx
  ON public.delivery_dispatch_events (partner_id, created_at DESC);

ALTER TABLE public.delivery_dispatch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_dispatch_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_dispatch_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_dispatch_events TO authenticated;
GRANT ALL ON TABLE public.delivery_dispatch_events TO service_role;

DROP POLICY IF EXISTS delivery_dispatch_events_select_partner ON public.delivery_dispatch_events;
CREATE POLICY delivery_dispatch_events_select_partner
  ON public.delivery_dispatch_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = delivery_dispatch_events.partner_id
        AND pu.user_id = auth.uid()
    )
  );

-- 4. Colunas de controle de despacho e bônus autorizado em delivery_assignments
ALTER TABLE public.delivery_assignments
  ADD COLUMN IF NOT EXISTS dispatch_started_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_tier             smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_exhausted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_exhausted_reason text,
  ADD COLUMN IF NOT EXISTS bonus_amount              numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_authorized_by       uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS bonus_authorized_at       timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_reason              text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_assignments_bonus_amount_check'
      AND conrelid = 'public.delivery_assignments'::regclass
  ) THEN
    ALTER TABLE public.delivery_assignments
      ADD CONSTRAINT delivery_assignments_bonus_amount_check
      CHECK (bonus_amount >= 0);
  END IF;
END
$$;
