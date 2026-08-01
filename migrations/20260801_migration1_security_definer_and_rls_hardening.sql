-- ==============================================================================
-- MIGRATION 1: SECURITY HARDENING (RLS & SECURITY DEFINER SEARCH PATH)
-- Data: 2026-08-01
-- Projeto: Dudit
-- Descrição: 
--   1. Ativa RLS nas 3 tabelas remanescentes (partner_moderation_actions, notification_scheduled_jobs, marketplace_metrics_events)
--   2. Trava o search_path em public, extensions, pg_temp em todas as 48 funções SECURITY DEFINER (com blocos resilientes)
--   3. Revoga permissão de execução via API REST (PostgREST) de funções exclusivas de Trigger
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CONFIGURAÇÃO DE RLS NAS 3 TABELAS REMANESCENTES
-- ------------------------------------------------------------------------------

-- 1.1 partner_moderation_actions (Risco: Logs Administrativos)
-- Ativa RLS. Nenhuma policy pública = Bloqueio total (Deny All) para anon/authenticated.
-- Acesso mantido exclusivamente via backend / service_role.
ALTER TABLE public.partner_moderation_actions ENABLE ROW LEVEL SECURITY;

-- 1.2 notification_scheduled_jobs (Risco: Fila de Notificações)
-- Ativa RLS. Nenhuma policy pública = Bloqueio total (Deny All) para anon/authenticated.
-- Acesso mantido exclusivamente via backend / worker / service_role.
ALTER TABLE public.notification_scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- 1.3 marketplace_metrics_events (Risco: Eventos de Métricas do Marketplace)
-- Ativa RLS. Permite apenas INSERT público (anon/authenticated) caso haja tracking do client no futuro.
-- Bloqueia SELECT, UPDATE e DELETE públicos (protegendo integridade e privacidade).
ALTER TABLE public.marketplace_metrics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir insercao de metricas por anon e authenticated" ON public.marketplace_metrics_events;
CREATE POLICY "Permitir insercao de metricas por anon e authenticated"
  ON public.marketplace_metrics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 2. TRAVAR SEARCH_PATH NAS FUNÇÕES SECURITY DEFINER (RESILIENTE A SOBRECARGAS)
-- Usamos um bloco PL/pgSQL com tratamento de EXCEPTION para garantir que sobrecargas
-- inexistentes ou já modificadas não interrompam a execução da migration.
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  -- accept_partner_invitation
  BEGIN ALTER FUNCTION public.accept_partner_invitation(uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- advance_recurring_subscription
  BEGIN ALTER FUNCTION public.advance_recurring_subscription(uuid, timestamptz) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- apply_account_balance_delta
  BEGIN ALTER FUNCTION public.apply_account_balance_delta(uuid, uuid, numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- audit_trigger_func
  BEGIN ALTER FUNCTION public.audit_trigger_func() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- auto_decrement_stock_on_order_paid
  BEGIN ALTER FUNCTION public.auto_decrement_stock_on_order_paid() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- check_report_threshold
  BEGIN ALTER FUNCTION public.check_report_threshold() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- claim_due_recurring_executions
  BEGIN ALTER FUNCTION public.claim_due_recurring_executions(integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- claim_moderation_jobs
  BEGIN ALTER FUNCTION public.claim_moderation_jobs(integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- cleanup_expired_step_up_tokens
  BEGIN ALTER FUNCTION public.cleanup_expired_step_up_tokens() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- complete_recurring_execution
  BEGIN ALTER FUNCTION public.complete_recurring_execution(uuid, uuid, uuid[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- create_product_transaction
  BEGIN ALTER FUNCTION public.create_product_transaction(jsonb, jsonb, jsonb) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- create_quote_with_items
  BEGIN ALTER FUNCTION public.create_quote_with_items(uuid, uuid, uuid, text, date, date, text, text, numeric, numeric, numeric, jsonb) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- decrement_store_product_stock
  BEGIN ALTER FUNCTION public.decrement_store_product_stock(uuid, integer, boolean) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- decrement_usage_counter
  BEGIN ALTER FUNCTION public.decrement_usage_counter(uuid, text, integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- duplicate_quote_with_items
  BEGIN ALTER FUNCTION public.duplicate_quote_with_items(uuid, uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- expire_due_return_requests
  BEGIN ALTER FUNCTION public.expire_due_return_requests() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- fail_recurring_execution
  BEGIN ALTER FUNCTION public.fail_recurring_execution(uuid, text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- finalize_order_inventory
  BEGIN ALTER FUNCTION public.finalize_order_inventory(uuid, uuid, uuid, text, text, jsonb, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- finalize_pos_sale (Sobrecargas de 8 e 9 parâmetros)
  BEGIN ALTER FUNCTION public.finalize_pos_sale(uuid, uuid, uuid, uuid, numeric, text, jsonb, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.finalize_pos_sale(uuid, uuid, uuid, uuid, numeric, text, jsonb, uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- generate_recurring_occurrences_bulk
  BEGIN ALTER FUNCTION public.generate_recurring_occurrences_bulk(uuid, date) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- get_address_partner_id
  BEGIN ALTER FUNCTION public.get_address_partner_id(uuid, uuid, uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- get_partner_video_monthly_count / get_partner_video_weekly_count
  BEGIN ALTER FUNCTION public.get_partner_video_monthly_count(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_partner_video_weekly_count(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- get_product_pending_orders_count
  BEGIN ALTER FUNCTION public.get_product_pending_orders_count(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- get_store_product_stock (Sobrecargas de 2 e 3 parâmetros)
  BEGIN ALTER FUNCTION public.get_store_product_stock(uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_store_product_stock(uuid, uuid, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Triggers e handlers
  BEGIN ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.handle_order_payment_stock() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.handle_payment_stock_update() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.handle_soft_delete_by_user() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Incrementos
  BEGIN ALTER FUNCTION public.increment_collection_views(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_community_video_clicks(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_community_video_views(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_invite_failed_attempts(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_store_product_stock(uuid, integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_usage_counter(uuid, text, integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.increment_user_risk_score(uuid, integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;

  -- Trava e auditoria
  BEGIN ALTER FUNCTION public.lock_subscription_row(uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.prevent_audit_log_modification() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.process_due_recurring_transactions(integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.recalculate_order_paid_values_trigger() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.recurring_plan_next_execution_at(text, integer, timestamptz, timestamptz, integer[], integer, boolean, integer, integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.release_order_inventory(uuid, uuid, jsonb, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.reserve_order_inventory(uuid, uuid, jsonb, uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.reset_monthly_counters() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.settle_installment_group(uuid, uuid, uuid, jsonb) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_store_products_stock_availability() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.transfer_store_stock(uuid, uuid, integer, uuid, uuid, text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.trg_update_promotion_usage_count() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;


-- ------------------------------------------------------------------------------
-- 3. BLOQUEAR INVOCAÇÃO DIRETA VIA POSTGREST API APENAS NAS FUNÇÕES DE TRIGGER
-- ------------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.audit_trigger_func() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.auto_decrement_stock_on_order_paid() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.check_report_threshold() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_order_payment_stock() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_payment_stock_update() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_soft_delete_by_user() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_modification() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_order_paid_values_trigger() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.sync_store_products_stock_availability() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.trg_update_promotion_usage_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

COMMIT;
