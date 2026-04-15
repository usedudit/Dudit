-- POS: Draft pre-sales and finalized sales pipeline

CREATE TABLE IF NOT EXISTS public.pre_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  completed_sale_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_sales_partner_status_created
  ON public.pre_sales (partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pre_sales_customer_id
  ON public.pre_sales (customer_id);

ALTER TABLE public.pre_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pre_sales_select_own" ON public.pre_sales;
CREATE POLICY "pre_sales_select_own" ON public.pre_sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pre_sales_insert_own" ON public.pre_sales;
CREATE POLICY "pre_sales_insert_own" ON public.pre_sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pre_sales_update_own" ON public.pre_sales;
CREATE POLICY "pre_sales_update_own" ON public.pre_sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "pre_sales_delete_own" ON public.pre_sales;
CREATE POLICY "pre_sales_delete_own" ON public.pre_sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  pre_sale_id UUID NULL REFERENCES public.pre_sales(id) ON DELETE SET NULL,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount NUMERIC(14,2) NOT NULL CHECK (final_amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'partially_paid')),
  finance_account_id UUID NULL REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'partially_paid', 'cancelled')),
  notes TEXT NULL,
  finalized_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_partner_created_at
  ON public.sales (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_pre_sale_id
  ON public.sales (pre_sale_id);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  product_id UUID NULL REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID NULL REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NULL,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(14,2) NOT NULL CHECK (subtotal >= 0),
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON public.sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_partner_id
  ON public.sale_items (partner_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_own" ON public.sales;
CREATE POLICY "sales_select_own" ON public.sales
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sales_insert_own" ON public.sales;
CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sales_update_own" ON public.sales;
CREATE POLICY "sales_update_own" ON public.sales
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sales_delete_own" ON public.sales;
CREATE POLICY "sales_delete_own" ON public.sales
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sale_items_select_own" ON public.sale_items;
CREATE POLICY "sale_items_select_own" ON public.sale_items
  FOR SELECT USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sale_items_insert_own" ON public.sale_items;
CREATE POLICY "sale_items_insert_own" ON public.sale_items
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sale_items_update_own" ON public.sale_items;
CREATE POLICY "sale_items_update_own" ON public.sale_items
  FOR UPDATE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sale_items_delete_own" ON public.sale_items;
CREATE POLICY "sale_items_delete_own" ON public.sale_items
  FOR DELETE USING (
    partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())
  );
