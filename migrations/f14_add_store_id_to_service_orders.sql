-- ============================================================================
-- Fase 14: Service Orders → Store-level (store_id direto na tabela)
-- ============================================================================
-- Diferente de promoções/cupons (N:N via bridge), uma Service Order
-- representa uma execução em UMA única loja (1:N).
--
-- Padrão segue appointments, orders, sales, transactions:
--   service_orders.store_id → stores(id) ON DELETE SET NULL
--
-- Regras:
--   store_id preenchido → pertence à loja específica
--   store_id NULL       → registro legado (pré-multi-store)
--   Após F14, toda criação NOVA deve gravar store_id obrigatoriamente
-- ============================================================================
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS
-- ============================================================================

BEGIN;

-- ─── Coluna store_id ────────────────────────────────────────────────────────

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_store_id
  ON public.service_orders(store_id);

-- ─── RLS: substituir partner_isolation (FOR ALL) por 4 policies individuais ──

-- 1. SELECT
DROP POLICY IF EXISTS partner_isolation ON public.service_orders;
DROP POLICY IF EXISTS service_orders_select ON public.service_orders;
CREATE POLICY service_orders_select ON public.service_orders
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (
      store_id IS NULL                               -- legado: acesso via partner
      OR public.user_has_store_access(store_id)      -- loja específica
    )
  );

-- 2. INSERT
DROP POLICY IF EXISTS service_orders_insert ON public.service_orders;
CREATE POLICY service_orders_insert ON public.service_orders
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- 3. UPDATE
DROP POLICY IF EXISTS service_orders_update ON public.service_orders;
CREATE POLICY service_orders_update ON public.service_orders
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

-- 4. DELETE
DROP POLICY IF EXISTS service_orders_delete ON public.service_orders;
CREATE POLICY service_orders_delete ON public.service_orders
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (
      store_id IS NULL
      OR public.user_has_store_access(store_id)
    )
  );

COMMIT;
