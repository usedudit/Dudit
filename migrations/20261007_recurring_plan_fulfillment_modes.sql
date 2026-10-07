-- ============================================================================
-- MIGRATION: Recurring plans - modalidades de entrega (fulfillment_modes)
-- Data: 2026-10-07
-- Projeto: Dudit
--
-- REGRA CENTRAL: o lojista escolhe no card "Frete" se o plano aceita Entrega,
-- Retirada ou as duas. Quando o plano e' SOMENTE retirada, nenhum frete e'
-- cobrado (a politica shipping_mode/flat fica ignorada e zerada).
--
--   recurring_plans.fulfillment_modes
--     subset de {delivery, pickup}, nunca vazio.
--     padrao {delivery, pickup} (comportamento atual dos planos existentes).
--
-- Base: nenhuma coluna de modalidade existia em recurring_plans.
-- ============================================================================

BEGIN;

ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS fulfillment_modes TEXT[] NOT NULL DEFAULT ARRAY['delivery', 'pickup'];

ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_fulfillment_modes_check;

ALTER TABLE public.recurring_plans
  ADD CONSTRAINT recurring_plans_fulfillment_modes_check
  CHECK (
    fulfillment_modes <@ ARRAY['delivery', 'pickup']::TEXT[]
    AND array_length(fulfillment_modes, 1) >= 1
  );

COMMENT ON COLUMN public.recurring_plans.fulfillment_modes IS
  'Modalidades aceitas pelo plano: delivery (entrega), pickup (retirada no '
  'local). Sem delivery nao ha cobranca de frete.';

COMMIT;
