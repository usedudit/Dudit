-- ============================================================================
-- F4.2 - Remover dependência de store_id legacy em RLS policies + índices
-- ============================================================================
-- Contexto:
--   products, services, customers, suppliers, product_kits são tabelas GLOBAL
--   cujo store_id está sendo removido (F4.3). As RLS policies não devem mais
--   referenciar store_id dessas tabelas - o isolamento por loja é feito via
--   bridge tables (store_products, store_services, etc.) no resolver layer.
--
--   Tabelas STORE/HYBRID (orders, stock_movements, payment_methods, etc.)
--   NÃO são alteradas - store_id é legítimo nelas.
--
-- Rollback:
--   Re-aplicar f3_rls_store_aware.sql + recriar índices.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. RLS Policies - remover gating store_id legacy
-- ============================================================

-- ─── Products ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- ─── Services ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS services_select_policy ON services;
CREATE POLICY services_select_policy ON services
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- ─── Customers ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- ─── Suppliers ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS suppliers_select_policy ON suppliers;
CREATE POLICY suppliers_select_policy ON suppliers
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- ─── Product Kits ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS product_kits_select_policy ON product_kits;
CREATE POLICY product_kits_select_policy ON product_kits
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM partner_users WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Índices legados store_id (serão removidos antes do DROP COLUMN)
-- ============================================================

DROP INDEX IF EXISTS idx_products_store_id;
DROP INDEX IF EXISTS idx_services_store_id;
DROP INDEX IF EXISTS idx_services_store_id_created;
DROP INDEX IF EXISTS idx_customers_store_id;
DROP INDEX IF EXISTS idx_suppliers_store_id;
DROP INDEX IF EXISTS idx_product_kits_store_id;

-- Nota: Outros índices idx_*_store_id (stock_movements, orders, cart_items,
-- payment_methods, reviews) NÃO são dropados - store_id é legítimo nessas
-- tabelas STORE/HYBRID.

-- ============================================================
-- 3. Relatório de validação
-- ============================================================

DO $$
DECLARE
  v_policies_updated INT := 5;
  v_indexes_dropped INT := 6;
  v_store_tables TEXT[] := ARRAY['orders', 'stock_movements', 'cart_items', 'payment_methods', 'reviews', 'product_kits'];
  v_indexes_kept INT;
  v_name TEXT;
BEGIN
  -- Conta índices store_id que NÃO devem ter sido dropados (store/hybrid legítimos)
  v_indexes_kept := 0;
  FOREACH v_name IN ARRAY v_store_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = v_name
        AND indexname = 'idx_' || v_name || '_store_id'
    ) THEN
      v_indexes_kept := v_indexes_kept + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '=== F4.2 Report ===';
  RAISE NOTICE 'RLS policies updated (removed store_id gating): %', v_policies_updated;
  RAISE NOTICE 'Legacy indexes dropped: % (products, services x2, customers, suppliers, product_kits)', v_indexes_dropped;
  RAISE NOTICE 'Store/Hybrid indexes preserved: %', v_indexes_kept;
END;
$$;

COMMIT;
