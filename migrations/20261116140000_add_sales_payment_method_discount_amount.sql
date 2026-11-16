-- Migration: Add payment_method_discount_amount to public.sales
-- Motivação:
--   Alinhar a tabela `sales` com `orders`, garantindo que a tabela de vendas PDV
--   possua a coluna payment_method_discount_amount, prevenindo erro 42703
--   (undefined_column) caso consultas financeiras ou relatórios busquem o campo.

BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sales.payment_method_discount_amount IS
  'Desconto concedido pelo meio de pagamento selecionado na venda PDV.';

COMMIT;

NOTIFY pgrst, 'reload schema';
