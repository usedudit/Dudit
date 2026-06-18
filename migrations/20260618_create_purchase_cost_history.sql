-- ============================================================================
-- MIGRATION: Purchase Cost History
-- Description: Tracks every cost change made during XML NF-e imports.
-- Allows answering: "what was the cost on date X?", "which supplier was cheaper?"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  xml_import_id UUID REFERENCES public.xml_imports(id) ON DELETE SET NULL,
  invoice_key TEXT,
  previous_cost NUMERIC(14,2),
  new_cost NUMERIC(14,2),
  unit_cost_from_xml NUMERIC(14,2),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cost_history_product
  ON public.purchase_cost_history(product_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_history_supplier
  ON public.purchase_cost_history(supplier_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_history_import
  ON public.purchase_cost_history(xml_import_id);

-- RLS
ALTER TABLE public.purchase_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_cost_history_select_own" ON public.purchase_cost_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = purchase_cost_history.product_id
        AND products.partner_id IN (
          SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
          UNION
          SELECT id FROM public.partners WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "purchase_cost_history_insert_own" ON public.purchase_cost_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = purchase_cost_history.product_id
        AND products.partner_id IN (
          SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
          UNION
          SELECT id FROM public.partners WHERE user_id = auth.uid()
        )
    )
  );

-- Grant access
GRANT SELECT, INSERT ON public.purchase_cost_history TO authenticated, service_role;
