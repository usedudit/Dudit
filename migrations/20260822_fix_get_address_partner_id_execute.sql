-- ==============================================================================
-- FIX: RESTAURA EXECUTE DE get_address_partner_id() PARA RLS
-- Data: 2026-08-22 | Projeto: Dudit
-- Descrição:
--   A migration 20260801_migration3_revoke_internal_secdef_execute.sql revogou
--   EXECUTE de get_address_partner_id() de PUBLIC, anon e authenticated.
--
--   Essa função é um SECURITY DEFINER helper invocado pelas 4 políticas RLS
--   da tabela addresses (SELECT, INSERT, UPDATE, DELETE). Sem permissão de
--   EXECUTE, o PostgreSQL bloqueia com erro 42501 (permission denied).
--
--   Este fix restaura o EXECUTE, no mesmo padrão do fix anterior
--   (20260820_fix_helper_secdef_execute.sql).
-- ==============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_address_partner_id(uuid, uuid, uuid, uuid) TO PUBLIC, anon, authenticated;

COMMIT;
