-- ============================================================================
-- MIGRATION: Add file_key and file_name to xml_imports
-- Description: Stores R2 storage key and filename for imported NF-e XML files.
-- ============================================================================

ALTER TABLE public.xml_imports
  ADD COLUMN IF NOT EXISTS file_key TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;

NOTIFY pgrst, 'reload schema';
