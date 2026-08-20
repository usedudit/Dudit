-- ==============================================================================
-- FIX: RESTAURA EXECUTE DAS FUNÇÕES SECURITY DEFINER USADAS POR RLS
-- Data: 2026-08-20 | Projeto: Dudit
-- Descrição:
--   A migration 20260801_migration3_revoke_internal_secdef_execute.sql revogou
--   EXECUTE de get_user_partner_ids(), user_has_store_access() e
--   get_user_full_context() de PUBLIC, anon e authenticated.
--
--   Essas funções são helpers SECURITY DEFINER invocadas por 100+ políticas RLS
--   (partner_users, stores, products, customers, billing, payments, etc.).
--   Mesmo sendo SECURITY DEFINER, o PostgreSQL exige que o role da query
--   (anon/authenticated no PostgREST) tenha permissão de EXECUTE na função.
--   A revogação quebra todas as queries que passam por essas políticas com o
--   erro 42501 (permission denied for function ...).
--
--   Este fix restaura o estado original (EXECUTE para PUBLIC), incluindo
--   anon e authenticated.
-- ==============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_user_partner_ids() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_store_access(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_full_context() TO PUBLIC, anon, authenticated;

COMMIT;