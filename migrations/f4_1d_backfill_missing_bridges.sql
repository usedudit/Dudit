-- ============================================================================
-- F4.1d - Backfill bridges faltantes (segurança)
-- ============================================================================
-- Garante que TODO produto/serviço/fornecedor/kit com store_id legacy tenha
-- sua contraparte na bridge table. Idempotente.
-- ============================================================================

BEGIN;

-- 1. Products → store_products (backfill segurança pós-F5)
INSERT INTO store_products (product_id, store_id, is_active, created_at, updated_at)
SELECT
  p.id,
  p.store_id,
  COALESCE(p.is_active, true),
  NOW(),
  NOW()
FROM products p
WHERE p.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_products sp
    WHERE sp.product_id = p.id AND sp.store_id = p.store_id
  );

-- 2. Services → store_services (backfill segurança pós-F6)
INSERT INTO store_services (service_id, store_id, is_active, created_at, updated_at)
SELECT
  s.id,
  s.store_id,
  true,
  NOW(),
  NOW()
FROM services s
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_services ss
    WHERE ss.service_id = s.id AND ss.store_id = s.store_id
  );

-- 3. Suppliers → store_suppliers (já em F4.1c, refaz para segurança)
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

-- 4. Product kits → store_product_kits (já em F4.1c, refaz para segurança)
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

-- Relatório
DO $$
DECLARE
  v_p INT; v_s INT; v_sup INT; v_k INT;
BEGIN
  SELECT COUNT(*) INTO v_p FROM store_products;
  SELECT COUNT(*) INTO v_s FROM store_services;
  SELECT COUNT(*) INTO v_sup FROM store_suppliers;
  SELECT COUNT(*) INTO v_k FROM store_product_kits;
  RAISE NOTICE '=== F4.1d Backfill Report ===';
  RAISE NOTICE 'store_products: %', v_p;
  RAISE NOTICE 'store_services: %', v_s;
  RAISE NOTICE 'store_suppliers: %', v_sup;
  RAISE NOTICE 'store_product_kits: %', v_k;
END;
$$;

COMMIT;
