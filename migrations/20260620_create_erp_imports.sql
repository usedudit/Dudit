-- ============================================================================
-- MIGRATION: ERP Spreadsheet Import History
-- Table: erp_imports
-- Description: Audit trail for spreadsheet imports (products, customers, services)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.erp_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('products', 'customers', 'services')),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  warnings_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_imports_partner
  ON public.erp_imports(partner_id, created_at DESC);

ALTER TABLE public.erp_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_imports_team_select"
  ON public.erp_imports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "erp_imports_team_insert"
  ON public.erp_imports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "erp_imports_team_update"
  ON public.erp_imports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = erp_imports.partner_id
        AND user_id = auth.uid()
    )
  );
