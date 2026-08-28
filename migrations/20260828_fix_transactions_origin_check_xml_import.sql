-- ============================================================================
-- Fix transactions_origin_check constraint: add 'xml_import' as allowed value
--
-- The revert_xml_import RPC and execute_xml_import RPC insert transactions
-- with origin = 'xml_import', but the constraint only allows
-- ('manual', 'system', 'gateway'). This causes:
--   "new row for relation "transactions" violates check constraint
--    "transactions_origin_check""
-- ============================================================================

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_origin_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_origin_check
  CHECK (origin IN ('manual', 'system', 'gateway', 'xml_import'));

NOTIFY pgrst, 'reload schema';
