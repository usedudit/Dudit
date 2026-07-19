-- ============================================================
-- Fase 4.3 — Drop legacy store_id columns
-- ============================================================
-- Pré-requisitos (validados):
--   ✓ Nenhuma view referencia store_id nestas tabelas
--   ✓ Nenhum trigger referencia store_id
--   ✓ Nenhuma function/RPC referencia legacy store_id
--   ✓ Nenhuma RLS policy referencia store_id nestas tabelas
--   ✓ Nenhum index sobre store_id
--   ✓ Bridge tables (store_products, store_services, store_customers,
--     store_suppliers, store_product_kits) populadas e coverage 100%
-- ============================================================

ALTER TABLE products      DROP COLUMN store_id;
ALTER TABLE services      DROP COLUMN store_id;
ALTER TABLE customers     DROP COLUMN store_id;
ALTER TABLE suppliers     DROP COLUMN store_id;
ALTER TABLE product_kits  DROP COLUMN store_id;

-- ============================================================
-- Rollback (if needed):
--   ALTER TABLE products      ADD COLUMN store_id UUID REFERENCES stores(id);
--   ALTER TABLE services      ADD COLUMN store_id UUID REFERENCES stores(id);
--   ALTER TABLE customers     ADD COLUMN store_id UUID REFERENCES stores(id);
--   ALTER TABLE suppliers     ADD COLUMN store_id UUID REFERENCES stores(id);
--   ALTER TABLE product_kits  ADD COLUMN store_id UUID REFERENCES stores(id);
-- ============================================================
