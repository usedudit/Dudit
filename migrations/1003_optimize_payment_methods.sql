-- Create migration to optimize and clean up payment methods
-- Author: Dudit AI
-- Date: 2026-03-30

-- 1. Remove redundant and unused fee tables
DROP TABLE IF EXISTS payment_method_fees CASCADE;
DROP TABLE IF EXISTS payment_method_installment_fees CASCADE;

-- 2. Add indexes for performance optimization
-- Speed up lookups by partner (used in dashboard and management)
CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_id 
ON payment_methods(partner_id);

-- Speed up filtering by active status (used in storefront and checkout)
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active 
ON payment_methods(is_active);

-- Speed up list ordering and pagination
CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_created 
ON payment_methods(partner_id, created_at DESC);

-- 3. Add comment to clarify the current consolidated structure in the payment_methods table
COMMENT ON TABLE payment_methods IS 'Tabela consolidada de métodos de pagamento com taxas integradas (Gold Standard Dudit).';
