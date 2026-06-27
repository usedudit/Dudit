-- ============================================================================
-- MIGRATION: Add reversal support to xml_imports
-- Description: Columns for safe transactional reversal of XML NF-e imports.
-- No data is ever deleted - all reversals are auditable.
-- ============================================================================

-- 1. Add reversal columns to xml_imports
ALTER TABLE public.xml_imports
  ADD COLUMN IF NOT EXISTS reversal_movement_id UUID
    REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Update status CHECK to include 'reversed'
ALTER TABLE public.xml_imports DROP CONSTRAINT IF EXISTS xml_imports_status_check;

ALTER TABLE public.xml_imports ADD CONSTRAINT xml_imports_status_check
  CHECK (status IN ('pending', 'preview', 'completed', 'failed', 'reprocessing', 'reversed'));

-- 3. Index for finding reversed imports
CREATE INDEX IF NOT EXISTS idx_xml_imports_reversed
  ON public.xml_imports(reversed_at DESC NULLS LAST)
  WHERE reversed_at IS NOT NULL;
