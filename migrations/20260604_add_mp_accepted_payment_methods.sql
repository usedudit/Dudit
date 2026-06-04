-- Add mp_accepted_payment_methods column to partners table
-- Stores which Mercado Pago payment methods are accepted by the seller
-- Default: all methods enabled
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS mp_accepted_payment_methods JSONB
  DEFAULT '{"credit_card":true,"debit_card":true,"pix":true,"boleto":true,"mercado_pago_wallet":true}'::jsonb;

COMMENT ON COLUMN partners.mp_accepted_payment_methods IS 'JSONB map of accepted Mercado Pago payment methods. Keys: credit_card, debit_card, pix, boleto, mercado_pago_wallet. Values: boolean.';
