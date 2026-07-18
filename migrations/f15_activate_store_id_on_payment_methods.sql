-- ============================================================================
-- Fase 15: Payment Methods → Store-level (ativar store_id existente)
-- ============================================================================
-- A coluna store_id já existe em payment_methods (adicionada na migration 02),
-- mas nunca foi populada, consultada, ou integrada ao RLS.
--
-- Esta migration:
--   1. Droppa TODAS as policies antigas (acumuladas de 013, 015, 021, 034, 950)
--   2. Cria 4 policies novas com store-awareness
--
-- Regras:
--   store_id NULL       → método padrão do partner (funciona para qualquer loja)
--   store_id preenchido → override exclusivo da loja específica
--   Busca: 1º métodos da loja, 2º fallback para métodos globais (store_id NULL)
-- ============================================================================
-- Idempotente: DROP POLICY IF EXISTS / OR REPLACE
-- ============================================================================

BEGIN;

-- ─── 1. Dropar todas as policies existentes ────────────────────────────────
-- Nome em inglês (013_advanced_payment_methods.sql)
DROP POLICY IF EXISTS payment_methods_select_partner ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_insert_partner ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_update_partner ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_delete_partner ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_select_all_active ON public.payment_methods;

-- Nome em português (015_fix_payment_methods_structure.sql)
DROP POLICY IF EXISTS "Parceiros podem ver seus métodos de pagamento" ON public.payment_methods;
DROP POLICY IF EXISTS "Parceiros podem criar métodos de pagamento" ON public.payment_methods;
DROP POLICY IF EXISTS "Parceiros podem atualizar seus métodos de pagamento" ON public.payment_methods;
DROP POLICY IF EXISTS "Parceiros podem deletar seus métodos de pagamento" ON public.payment_methods;

-- Nomes corrigidos (021_fix_rls_policies_corrected.sql / 950_security_fix_rls_and_policies.sql)
DROP POLICY IF EXISTS "Partner owners can view payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Customers can view active payment types" ON public.payment_methods;
DROP POLICY IF EXISTS payment_methods_select_active_for_checkout ON public.payment_methods;

-- ─── 2. Criar 4 policies store-aware ────────────────────────────────────────
-- Segue o padrão F14 (service_orders):
--   partner_id IN get_user_partner_ids()  → acesso ao partner
--   store_id IS NULL OR user_has_store_access(store_id)  → acesso à loja

-- 2a. SELECT
CREATE POLICY payment_methods_select ON public.payment_methods
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 2b. INSERT
CREATE POLICY payment_methods_insert ON public.payment_methods
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 2c. UPDATE
CREATE POLICY payment_methods_update ON public.payment_methods
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 2d. DELETE
CREATE POLICY payment_methods_delete ON public.payment_methods
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

COMMIT;
