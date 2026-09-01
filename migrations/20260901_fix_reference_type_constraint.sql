-- Fix: reference_type CHECK constraint does not allow 'xml_import' or 'pos_sale'
-- These values are used by execute_xml_import RPC and POS sale completion

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_reference_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reference_type_check
  CHECK (reference_type IN ('customer', 'supplier', 'internal', 'xml_import', 'pos_sale'));
