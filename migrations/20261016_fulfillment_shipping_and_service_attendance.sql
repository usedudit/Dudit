-- ============================================================================
-- MIGRATION: Fulfillment explícito (shipping/nacional) + atendimento de serviço
-- Data: 2026-10-16
-- Projeto: Dudit
--
-- OBJETIVO
--   1. Introduzir o modo de fulfillment "shipping" (envio nacional/transportadora)
--      no modelo de capacidades de catálogo e nas linhas de carrinho/pedido.
--   2. Garantir as colunas de delivery_settings que existiam apenas no runtime
--      (is_pickup_enabled, free_delivery_threshold) para manter as migrations
--      alinhadas ao banco (idempotente).
--   3. Criar service_attendance_settings (raio de atendimento + taxa de
--      deslocamento de serviços), com fallback partner -> store e override
--      opcional por serviço.
--
-- IDs de constraints (confirmados no banco):
--   cart_items_fulfillment_mode_check
--   order_items_fulfillment_mode_check
--   appointments_fulfillment_mode_check   (segue {on_site, customer_location})
--   recurring_plans_fulfillment_modes_check
--
-- Idempotente: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
-- ============================================================================

BEGIN;

-- ─── 1. delivery_settings: colunas que só existiam no runtime ────────────────
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS is_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS free_delivery_threshold NUMERIC NULL;

-- ─── 2. CHECKs das linhas de carrinho/pedido: incluir 'shipping' ─────────────
ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS cart_items_fulfillment_mode_check;
ALTER TABLE public.cart_items
  ADD CONSTRAINT cart_items_fulfillment_mode_check
  CHECK (
    fulfillment_mode IS NULL
    OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location', 'shipping')
  );

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_fulfillment_mode_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_fulfillment_mode_check
  CHECK (
    fulfillment_mode IS NULL
    OR fulfillment_mode IN ('delivery', 'pickup', 'on_site', 'customer_location', 'shipping')
  );

-- ─── 3. recurring_plans: incluir 'shipping' ──────────────────────────────────
ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_fulfillment_modes_check;
ALTER TABLE public.recurring_plans
  ADD CONSTRAINT recurring_plans_fulfillment_modes_check
  CHECK (
    fulfillment_modes <@ ARRAY['delivery', 'pickup', 'shipping']::TEXT[]
    AND array_length(fulfillment_modes, 1) >= 1
  );

-- ─── 4. products: constraint explícita de modos permitidos ───────────────────
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_fulfillment_modes_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_fulfillment_modes_check
  CHECK (
    fulfillment_modes <@ ARRAY['delivery', 'pickup', 'shipping']::TEXT[]
    AND array_length(fulfillment_modes, 1) >= 1
  );

-- ─── 5. services: constraint explícita de modos permitidos ───────────────────
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_fulfillment_modes_check;
ALTER TABLE public.services
  ADD CONSTRAINT services_fulfillment_modes_check
  CHECK (
    fulfillment_modes <@ ARRAY['on_site', 'customer_location']::TEXT[]
    AND array_length(fulfillment_modes, 1) >= 1
  );

-- ─── 6. Override opcional de atendimento por serviço ─────────────────────────
--   NULL = herdar o default da loja (service_attendance_settings).
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_max_km NUMERIC NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_travel_fee_mode TEXT NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_free_travel_km NUMERIC NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_travel_flat_fee NUMERIC NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_travel_per_km NUMERIC NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_enforce_area BOOLEAN NULL;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_service_travel_fee_mode_check;
ALTER TABLE public.services
  ADD CONSTRAINT services_service_travel_fee_mode_check
  CHECK (
    service_travel_fee_mode IS NULL
    OR service_travel_fee_mode IN ('free', 'flat', 'per_km', 'tiered')
  );

-- ─── 7. service_attendance_settings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_attendance_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  store_id            UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  max_service_km      NUMERIC NULL,             -- NULL = sem limite de deslocamento
  travel_fee_mode     TEXT NOT NULL DEFAULT 'free'
                        CHECK (travel_fee_mode IN ('free', 'flat', 'per_km', 'tiered')),
  free_travel_km      NUMERIC NOT NULL DEFAULT 0,
  travel_flat_fee     NUMERIC NOT NULL DEFAULT 0,
  travel_per_km       NUMERIC NOT NULL DEFAULT 0,
  travel_tiers        JSONB NOT NULL DEFAULT '[]'::JSONB,  -- [{ "upToKm": number, "fee": number }]
  enforce_service_area BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_attendance_partner
  ON public.service_attendance_settings(partner_id);

CREATE INDEX IF NOT EXISTS idx_service_attendance_store
  ON public.service_attendance_settings(store_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_attendance_partner_default
  ON public.service_attendance_settings(partner_id) WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_attendance_partner_store
  ON public.service_attendance_settings(partner_id, store_id) WHERE store_id IS NOT NULL;

-- ─── 8. RLS store-aware (espelha delivery_settings) ──────────────────────────
ALTER TABLE public.service_attendance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_attendance_settings_select ON public.service_attendance_settings;
CREATE POLICY service_attendance_settings_select ON public.service_attendance_settings
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_attendance_settings_insert ON public.service_attendance_settings;
CREATE POLICY service_attendance_settings_insert ON public.service_attendance_settings
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_attendance_settings_update ON public.service_attendance_settings;
CREATE POLICY service_attendance_settings_update ON public.service_attendance_settings
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS service_attendance_settings_delete ON public.service_attendance_settings;
CREATE POLICY service_attendance_settings_delete ON public.service_attendance_settings
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- ─── 9. Comentários ──────────────────────────────────────────────────────────
COMMENT ON COLUMN public.products.fulfillment_modes IS
  'Modos permitidos: delivery (entrega local), pickup (retirada), shipping (envio nacional).';
COMMENT ON COLUMN public.services.service_travel_fee_mode IS
  'Override por serviço: free | flat | per_km | tiered. NULL = herda da loja.';
COMMENT ON TABLE public.service_attendance_settings IS
  'Raio de atendimento e taxa de deslocamento de serviços (fallback partner -> store).';

COMMIT;
