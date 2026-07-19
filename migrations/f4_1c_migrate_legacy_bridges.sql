-- ============================================================================
-- F4.1c — Migrar dados legacy store_id para bridge tables
-- ============================================================================
-- Migra dados existentes de store_id nas tabelas base (suppliers, product_kits)
-- para as respectivas bridge tables (store_suppliers, store_product_kits).
--
-- Idempotente: usa NOT EXISTS para evitar duplicatas.
-- Gera relatório de quantidade migrada (ver logs do banco).
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. suppliers → store_suppliers
-- ============================================================
INSERT INTO store_suppliers (supplier_id, store_id, is_active, created_at, updated_at)
SELECT
  s.id,
  s.store_id,
  true,
  NOW(),
  NOW()
FROM suppliers s
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_suppliers ss
    WHERE ss.supplier_id = s.id AND ss.store_id = s.store_id
  );

-- ============================================================
-- 2. product_kits → store_product_kits
-- ============================================================
INSERT INTO store_product_kits (kit_id, store_id, is_active, created_at, updated_at)
SELECT
  pk.id,
  pk.store_id,
  true,
  NOW(),
  NOW()
FROM product_kits pk
WHERE pk.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_product_kits spk
    WHERE spk.kit_id = pk.id AND spk.store_id = pk.store_id
  );

-- ============================================================
-- 3. Relatório de migração (opcional — via RAISE NOTICE)
-- ============================================================
DO $$
DECLARE
  v_suppliers_migrated INT;
  v_kits_migrated INT;
  v_products_legacy INT;
  v_services_legacy INT;
BEGIN
  SELECT COUNT(*) INTO v_suppliers_migrated
  FROM store_suppliers ss
  WHERE EXISTS (SELECT 1 FROM suppliers s WHERE s.id = ss.supplier_id AND s.store_id = ss.store_id);

  SELECT COUNT(*) INTO v_kits_migrated
  FROM store_product_kits spk
  WHERE EXISTS (SELECT 1 FROM product_kits pk WHERE pk.id = spk.kit_id AND pk.store_id = spk.store_id);

  SELECT COUNT(*) INTO v_products_legacy
  FROM products WHERE store_id IS NOT NULL;

  SELECT COUNT(*) INTO v_services_legacy
  FROM services WHERE store_id IS NOT NULL;

  RAISE NOTICE '=== F4.1c Migration Report ===';
  RAISE NOTICE 'store_suppliers migrados: %', v_suppliers_migrated;
  RAISE NOTICE 'store_product_kits migrados: %', v_kits_migrated;
  RAISE NOTICE 'products.store_id ainda preenchido (legacy): %', v_products_legacy;
  RAISE NOTICE 'services.store_id ainda preenchido (legacy): %', v_services_legacy;
  RAISE NOTICE '=============================';
END;
$$;

COMMIT;
