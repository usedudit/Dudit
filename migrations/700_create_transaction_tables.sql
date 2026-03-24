-- ============================================================
-- 700: Criar tabelas transaction_contacts e transactions
-- ============================================================

-- Tabela de contatos para transações
-- Referencia clientes, fornecedores, funcionários ou "outro"
CREATE TABLE IF NOT EXISTS public.transaction_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cliente', 'fornecedor', 'funcionario', 'outro')),
  description TEXT,
  contact_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.transaction_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transaction_contacts_select_own" ON public.transaction_contacts
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transaction_contacts_insert_own" ON public.transaction_contacts
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transaction_contacts_update_own" ON public.transaction_contacts
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transaction_contacts_delete_own" ON public.transaction_contacts
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_transaction_contacts_partner_id ON public.transaction_contacts(partner_id);
CREATE INDEX IF NOT EXISTS idx_transaction_contacts_type ON public.transaction_contacts(type);

-- ============================================================
-- Tabela de transações financeiras
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  contact_id UUID REFERENCES public.transaction_contacts(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE,
  payment_date TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'Pendente',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  installment_number INTEGER,
  total_installments INTEGER,
  original_amount NUMERIC(10,2),
  interest_amount NUMERIC(10,2) DEFAULT 0,
  fee_amount NUMERIC(10,2) DEFAULT 0,
  payment_type TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense'))
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_own" ON public.transactions
  FOR SELECT USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transactions_update_own" ON public.transactions
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE POLICY "transactions_delete_own" ON public.transactions
  FOR DELETE USING (
    partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_transactions_partner_id ON public.transactions(partner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON public.transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_date ON public.transactions(payment_date);
CREATE INDEX IF NOT EXISTS idx_transactions_due_date ON public.transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_description ON public.transactions(description);
