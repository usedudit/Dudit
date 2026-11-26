-- ============================================================================
-- MIGRATION: Regras de frete grátis por estado/valor para entrega via transportadora (SuperFrete)
-- Data: 2026-11-26
-- Projeto: Dudit
--
-- OBJETIVO
--   Criar tabela public.carrier_free_shipping_rules para permitir que lojas
--   com integração SuperFrete configurem faixas de frete grátis por valor mínimo
--   do pedido e lista de estados (UFs) ou todo o Brasil, separadas do delivery próprio.
--
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.carrier_free_shipping_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  min_order_value NUMERIC NOT NULL DEFAULT 0 CHECK (min_order_value >= 0),
  all_states      BOOLEAN NOT NULL DEFAULT FALSE,
  states          TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  applies_to      TEXT NOT NULL DEFAULT 'cheapest' CHECK (applies_to IN ('cheapest', 'all')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT carrier_free_shipping_rules_scope_check
    CHECK (all_states = TRUE OR array_length(states, 1) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_carrier_free_shipping_rules_partner
  ON public.carrier_free_shipping_rules(partner_id);

CREATE INDEX IF NOT EXISTS idx_carrier_free_shipping_rules_store
  ON public.carrier_free_shipping_rules(store_id);

-- RLS store-aware (espelha delivery_settings e service_attendance_settings)
ALTER TABLE public.carrier_free_shipping_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_free_shipping_rules_select ON public.carrier_free_shipping_rules;
CREATE POLICY carrier_free_shipping_rules_select ON public.carrier_free_shipping_rules
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS carrier_free_shipping_rules_insert ON public.carrier_free_shipping_rules;
CREATE POLICY carrier_free_shipping_rules_insert ON public.carrier_free_shipping_rules
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS carrier_free_shipping_rules_update ON public.carrier_free_shipping_rules;
CREATE POLICY carrier_free_shipping_rules_update ON public.carrier_free_shipping_rules
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

DROP POLICY IF EXISTS carrier_free_shipping_rules_delete ON public.carrier_free_shipping_rules;
CREATE POLICY carrier_free_shipping_rules_delete ON public.carrier_free_shipping_rules
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

COMMENT ON TABLE public.carrier_free_shipping_rules IS
  'Regras de frete grátis por valor mínimo e UF (ou todo o Brasil) para envio via transportadora (SuperFrete).';

COMMIT;
