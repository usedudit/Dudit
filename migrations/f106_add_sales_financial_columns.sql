-- ============================================================================
-- Fase 10.6 - Add financial breakdown columns to public.sales
-- ============================================================================
-- As colunas payment_method_interest_amount, payment_method_fee_amount e
-- payment_method_fixed_fee_amount já existem em public.orders mas NÃO em
-- public.sales. Esta migration adiciona essas colunas para que vendas PDV
-- também tenham os valores de juros/taxas/descontos do método de pagamento
-- persistidos diretamente na tabela.
-- ============================================================================

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method_interest_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method_fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method_fixed_fee_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sales.payment_method_interest_amount IS
  'Juros do meio de pagamento (separado de taxas) - snapshot no momento da finalizacao da venda.';

COMMENT ON COLUMN public.sales.payment_method_fee_amount IS
  'Taxa percentual do meio de pagamento (separado de juros) - snapshot no momento da finalizacao da venda.';

COMMENT ON COLUMN public.sales.payment_method_fixed_fee_amount IS
  'Taxa fixa do meio de pagamento (ex.: R$ 1,50 por transacao) - snapshot no momento da finalizacao da venda.';

COMMIT;

NOTIFY pgrst, 'reload schema';
