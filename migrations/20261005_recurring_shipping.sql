-- ============================================================================
-- MIGRATION: Recurring shipping - snapshot de frete (Fase 3)
-- Data: 2026-10-05
-- Projeto: Dudit
--
-- REGRA CENTRAL: o frete de uma assinatura NUNCA e re-cotado na cobranca.
-- E' resolvido uma unica vez no cadastro, gravado em
-- recurring_subscriptions.shipping_amount e usado identico em todos os ciclos.
--
--   recurring_plans
--     shipping_mode        - como o frete do plano se comporta
--                            'included' - frete incluso no preco dos itens
--                            'flat'     - valor fixo definido pelo lojista
--                            'quote'    - cotado na transportadora no cadastro
--     shipping_flat_amount - usado somente quando shipping_mode = 'flat'
--
--   recurring_subscriptions
--     shipping_amount           - valor efetivamente contratado (fonte da
--                                 verdade para os ciclos 2..N)
--     shipping_source           - de onde veio o valor contratado
--                                 pickup       - retirada, sem frete
--                                 included     - incluso no preco
--                                 flat         - valor fixo do plano
--                                 quote_own    - cotado pelo lojista
--                                 quote_carrier- cotado pela transportadora
--     shipping_quoted_at        - quando o snapshot foi resolvido
--     carrier_service_id        - servico da transportadora usado na cotacao
--     pending_address           - endereco aguardando confirmacao do cliente
--                                 quando o novo frete e' MAIOR que o atual
--     pending_shipping_amount   - valor novo aguardando confirmacao
--
--   recurring_executions
--     shipping_amount - frete cobrado nesta execucao (audit trail; em 2..N
--                       copia o valor da assinatura, nunca re-cota)
--
-- Base: nenhuma coluna de frete existia nas tres tabelas.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) recurring_plans: politica de frete do plano
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT NOT NULL DEFAULT 'included';

ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS shipping_flat_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.recurring_plans
  DROP CONSTRAINT IF EXISTS recurring_plans_shipping_mode_check;

ALTER TABLE public.recurring_plans
  ADD CONSTRAINT recurring_plans_shipping_mode_check
  CHECK (shipping_mode IN ('included', 'flat', 'quote'));

ALTER TABLE public.recurring_plans
  ADD CONSTRAINT recurring_plans_shipping_flat_amount_check
  CHECK (shipping_flat_amount >= 0);

COMMENT ON COLUMN public.recurring_plans.shipping_mode IS
  'included (frete incluso no preco) | flat (valor fixo do lojista) | '
  'quote (cotado na transportadora no cadastro, nunca re-cotado na cobranca)';
COMMENT ON COLUMN public.recurring_plans.shipping_flat_amount IS
  'Valor fixo de frete aplicavel somente quando shipping_mode = flat.';

-- ---------------------------------------------------------------------------
-- 2) recurring_subscriptions: snapshot de frete contratado
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS shipping_source TEXT NOT NULL DEFAULT 'pickup';

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS shipping_quoted_at TIMESTAMPTZ NULL;

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS carrier_service_id TEXT NULL;

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS pending_address TEXT NULL;

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS pending_shipping_amount NUMERIC(14,2) NULL;

ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_shipping_source_check;

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_shipping_source_check
  CHECK (shipping_source IN (
    'pickup', 'included', 'flat', 'quote_own', 'quote_carrier'
  ));

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_shipping_amount_check
  CHECK (shipping_amount >= 0);

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_pending_shipping_amount_check
  CHECK (pending_shipping_amount IS NULL OR pending_shipping_amount >= 0);

COMMENT ON COLUMN public.recurring_subscriptions.shipping_amount IS
  'Frete contratado, congelado no cadastro. Replicado em todos os ciclos; '
  'nunca e re-cotado na cobranca.';
COMMENT ON COLUMN public.recurring_subscriptions.shipping_source IS
  'pickup (retirada) | included (incluso no preco) | flat (fixo do plano) | '
  'quote_own (lojista cotou) | quote_carrier (transportadora cotou)';
COMMENT ON COLUMN public.recurring_subscriptions.carrier_service_id IS
  'Servico da transportadora (PAC/SEDEX/etc) usado na cotacao de origem, '
  'quando shipping_source = quote_carrier.';
COMMENT ON COLUMN public.recurring_subscriptions.pending_address IS
  'Novo endereco aguardando confirmacao do cliente quando o frete resultante '
  'e maior que o atual. Nada e aplicado sem consentimento.';
COMMENT ON COLUMN public.recurring_subscriptions.pending_shipping_amount IS
  'Frete do novo endereco, aguardando confirmacao do cliente.';

-- ---------------------------------------------------------------------------
-- 3) recurring_executions: frete do ciclo
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_executions
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.recurring_executions
  ADD CONSTRAINT recurring_executions_shipping_amount_check
  CHECK (shipping_amount >= 0);

COMMENT ON COLUMN public.recurring_executions.shipping_amount IS
  'Frete cobrado neste ciclo. Ciclos 2..N copiam recurring_subscriptions.'
  'shipping_amount; apenas o ciclo 1 pode trazer um valor cotado.';

COMMIT;
