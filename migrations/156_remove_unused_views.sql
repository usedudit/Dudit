-- Remove views que não estão sendo usadas e causam problemas de schema cache
DROP VIEW IF EXISTS partners_public_secure CASCADE;
DROP VIEW IF EXISTS partners_checkout_secure CASCADE;

-- Confirmar que partners table existe e tá correta
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'partners'
ORDER BY ordinal_position;
