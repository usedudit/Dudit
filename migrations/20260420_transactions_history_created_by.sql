-- Transaction audit history (ERP) + creator attribution on transactions

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_created_by_user_id
  ON public.transactions (created_by_user_id);

CREATE TABLE IF NOT EXISTS public.transactions_history (
  id bigint generated always as identity primary key,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type varchar(32) NOT NULL,
  change_lines text[] NOT NULL CHECK (cardinality(change_lines) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_history_tx_created_idx
  ON public.transactions_history (transaction_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS transactions_history_partner_created_idx
  ON public.transactions_history (partner_id, created_at DESC, id DESC);

ALTER TABLE public.transactions_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_history_select_own" ON public.transactions_history;
CREATE POLICY "transactions_history_select_own"
  ON public.transactions_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.partners
      WHERE partners.id = transactions_history.partner_id
        AND partners.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "transactions_history_insert_own" ON public.transactions_history;
CREATE POLICY "transactions_history_insert_own"
  ON public.transactions_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.partners
      WHERE partners.id = transactions_history.partner_id
        AND partners.user_id = auth.uid()
    )
  );
