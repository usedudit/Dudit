-- Track which team member received the commission
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS seller_partner_user_id uuid REFERENCES public.partner_users(id);

-- Track which seller made the sale on PDV orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS seller_partner_user_id uuid REFERENCES public.partner_users(id);

-- Index for team stats queries
CREATE INDEX IF NOT EXISTS idx_transactions_seller_stats
ON public.transactions (partner_id, seller_partner_user_id, category, created_at);

CREATE INDEX IF NOT EXISTS idx_orders_seller_stats
ON public.orders (partner_id, seller_partner_user_id, created_at);
