-- Keyset pagination for financial transaction list (partner_id + created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_transactions_partner_created_at_id_desc
  ON public.transactions (partner_id, created_at DESC, id DESC);
