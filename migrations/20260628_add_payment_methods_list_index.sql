-- Add composite index for payment methods list query
-- Used by getPaymentMethodsAction: WHERE partner_id = ? ORDER BY is_default DESC, priority DESC, created_at ASC
CREATE INDEX IF NOT EXISTS idx_payment_methods_list_ordering
  ON payment_methods(partner_id, is_default DESC, priority DESC, created_at ASC);
