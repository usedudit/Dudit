-- Cash register sessions and movements integrated with POS

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ NULL,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  closing_balance NUMERIC(14,2) NULL CHECK (closing_balance >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_partner_id
  ON public.cash_sessions (partner_id);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_partner_status
  ON public.cash_sessions (partner_id, status, opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_open_user_partner
  ON public.cash_sessions (partner_id, user_id)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'withdrawal', 'deposit')),
  description TEXT NOT NULL,
  payment_method_id UUID NULL REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  reference_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_cash_session_id
  ON public.cash_movements (cash_session_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_partner_id
  ON public.cash_movements (partner_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_partner_session_type
  ON public.cash_movements (partner_id, cash_session_id, type);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id UUID NULL REFERENCES public.cash_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_cash_session_id
  ON public.sales (cash_session_id);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_sessions_select_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_own" ON public.cash_sessions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_sessions_insert_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_insert_own" ON public.cash_sessions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_sessions_update_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_update_own" ON public.cash_sessions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_sessions_delete_own" ON public.cash_sessions;
CREATE POLICY "cash_sessions_delete_own" ON public.cash_sessions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_movements_select_own" ON public.cash_movements;
CREATE POLICY "cash_movements_select_own" ON public.cash_movements
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_movements_insert_own" ON public.cash_movements;
CREATE POLICY "cash_movements_insert_own" ON public.cash_movements
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_movements_update_own" ON public.cash_movements;
CREATE POLICY "cash_movements_update_own" ON public.cash_movements
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cash_movements_delete_own" ON public.cash_movements;
CREATE POLICY "cash_movements_delete_own" ON public.cash_movements
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
