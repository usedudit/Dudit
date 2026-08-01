-- ==============================================================================
-- MIGRATION 3: REVOKE EXECUTE DE FUNÇÕES SECURITY DEFINER INTERNAS (GRUPO B)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   1. Revoga permissão de execução (PostgREST RPC) de 67 funções
--      SECURITY DEFINER que são exclusivamente internas (triggers, manutenção, crons).
--   2. Preserva integralmente o GRANT EXECUTE nas 74 RPCs utilizadas
--      pelo frontend (PDV, Checkout, Devoluções, Estoque, Orçamentos).
--   3. Blocos PL/pgSQL resilientes com EXCEPTION.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
  BEGIN REVOKE EXECUTE ON FUNCTION public.process_order_store_credit_usage() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(p_notification_ids uuid[]) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_subscription_snapshot() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits_on_payment() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.user_has_store_access(p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.build_return_policy_snapshot(p_partner_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_data() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_user_partner_ids() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.return_request_mark_sla_responded() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.expire_due_return_requests() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.calculate_return_eligibility(p_order_id uuid, p_request_at timestamp with time zone) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.advance_recurring_subscription(p_subscription_id uuid, p_executed_at timestamp with time zone) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.orders_snapshot_return_policy_on_paid() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.refresh_store_marketplace_reputation(p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.apply_return_partner_risk(p_partner_id uuid, p_source_type text, p_source_id uuid, p_points integer, p_metadata jsonb) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.check_return_rejection_risk(p_partner_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.expire_return_sla_requests() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_expired_step_up_tokens() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_user_modification() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_order_paid_values(p_order_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.fill_transaction_payment_adjustment() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_order_payment_stock(p_partner_id uuid, p_order_id uuid, p_created_by uuid, p_payment_status text, p_items jsonb, p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.handle_order_payment_stock(p_partner_id uuid, p_order_id uuid, p_payment_confirmed boolean, p_user_id uuid, p_payment_method text, p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.apply_pending_plan_switches() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.auto_expire_quotes() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.cleanup_stale_pending_subscriptions() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_default_bank_account_for_partner() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_default_cash_account_for_partner() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.create_default_cash_payment_method_for_partner() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.decrement_products_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.decrement_services_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.decrement_users_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.update_collection_items_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.set_service_order_defaults() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_address_partner_id(p_partner_id uuid, p_supplier_id uuid, p_customer_id uuid, p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_partner_mp_token(partner_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.get_user_full_context() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.increment_products_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.increment_services_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.increment_users_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.lock_finalized_quote() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.mask_document(document text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.prevent_item_change_on_finalized_quote() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.refresh_partner_marketplace_reputation(p_partner_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.increment_partner_sales(partner_uuid uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalc_quote_total() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.sync_marketplace_favorites_count() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_all_quote_totals(p_limit integer, p_partner_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_quote_totals(p_quote_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.backfill_reset_marketplace_counters() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.recalculate_marketplace_rolling_windows() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.reset_monthly_quotes() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.sanitize_text(input_text text) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.reset_monthly_counters() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.set_quote_item_defaults() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.set_quote_defaults() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.sync_pos_transaction_payment_to_cash_movement() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.update_quote_subtotal_incremental() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.ensure_usage_counters_exist() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public._resolve_report_partner(p_target_type text, p_target_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.reports_sanitize_inputs() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.reports_block_self_report() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public._assert_admin_caller() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.refresh_store_marketplace_fts(p_store_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.trg_stores_marketplace_fts() FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN REVOKE EXECUTE ON FUNCTION public.increment_partner_risk_score(p_partner_id uuid, p_points integer, p_source_type text, p_source_id uuid, p_metadata jsonb, p_admin_user_id uuid) FROM PUBLIC, anon, authenticated; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

COMMIT;
