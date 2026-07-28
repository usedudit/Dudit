-- ============================================================================
-- MIGRATION: Add processed_at column to xml_imports
-- Description: The execute_xml_import RPC already sets processed_at = NOW(),
--   but the column was never added to the table.
-- ============================================================================

ALTER TABLE public.xml_imports
ADD COLUMN processed_at TIMESTAMPTZ;
