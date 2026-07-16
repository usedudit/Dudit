-- ============================================================================
-- Fase 1 - Corrigir RLS da tabela stores para funcionar com team members
-- ============================================================================
-- As políticas antigas só funcionavam para o OWNER (via partners.user_id).
-- As novas políticas usam get_user_partner_ids() que já considera
-- tanto owner quanto invited users (partner_users).
-- ============================================================================

BEGIN;

-- Remover políticas antigas (owner-only)
DROP POLICY IF EXISTS "Partners can view their stores" ON stores;
DROP POLICY IF EXISTS "Partners can create stores" ON stores;
DROP POLICY IF EXISTS "Partners can update their stores" ON stores;
DROP POLICY IF EXISTS "Partners can delete their stores" ON stores;

-- Remover políticas com nomes alternativos (se existirem de migrações anteriores)
DROP POLICY IF EXISTS "stores_select" ON stores;
DROP POLICY IF EXISTS "stores_insert" ON stores;
DROP POLICY IF EXISTS "stores_update" ON stores;
DROP POLICY IF EXISTS "stores_delete" ON stores;

-- Criar novas políticas usando get_user_partner_ids()
-- Esta função já existe (criada na migration 970_fix_partner_users_recursion.sql)
-- e retorna todos os partner_ids que o usuário tem acesso.

CREATE POLICY "stores_select" ON stores
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_insert" ON stores
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_update" ON stores
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

CREATE POLICY "stores_delete" ON stores
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

COMMIT;
