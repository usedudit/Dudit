-- ============================================================================
-- Migration: Fix duplicate create_batch_stock_movement overloads
--
-- The previous migration (20260828_fix_stock_movements_xml_import_undo.sql)
-- added p_reference_name and p_reference_type parameters using CREATE OR REPLACE,
-- but since the signature changed, PostgreSQL created a SECOND overload instead
-- of replacing the original. This causes "function is not unique" errors when
-- callers use the original 7-parameter signature (e.g., PDV sales, returns).
--
-- Fix: DROP the old 7-parameter overload, keeping only the new 9-parameter version
-- which has DEFAULT NULL on the two new params, so existing callers work unchanged.
-- ============================================================================

-- Drop the OLD 7-param version (the one WITHOUT reference_name/reference_type)
DROP FUNCTION IF EXISTS public.create_batch_stock_movement(
    UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID
);

-- The new 9-param version (with p_reference_name, p_reference_type DEFAULT NULL)
-- was already created by the previous migration and remains intact.
-- All existing callers that pass 7 positional args will resolve to it
-- because the last 2 params have DEFAULT NULL.

-- Re-grant permissions to be safe
GRANT EXECUTE ON FUNCTION public.create_batch_stock_movement(UUID, TEXT, TEXT, TEXT, UUID, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
