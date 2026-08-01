-- ==============================================================================
-- MIGRATION 2.2: HARDENING SEARCH_PATH (NEGÓCIO, VENDAS, ESTOQUE E FINANÇAS)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   1. Trava o search_path em public, extensions, pg_temp nas 36 funções SECURITY INVOKER
--      do módulo de Negócio, Vendas, Estoque e Finanças do Dudit.
--   2. Exclui estritamente todas as 35 funções internas de extensão (pg_trgm, unaccent).
--   3. Usa blocos PL/pgSQL resilientes com EXCEPTION para garantir compatibilidade total.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
  BEGIN ALTER FUNCTION public.resolve_return_parent_item_id(p_order_item_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.generate_store_slug(p_name text, p_partner_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.generate_service_order_number() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.cleanup_old_2fa_attempts() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.default_return_policy_text(p_store_name text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.transaction_payments_fill_installment_breakdown() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.create_order_transaction_on_paid() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.compute_approval_hash(salt text, code text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_partner_offering_type() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_audit_log_fields() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.validate_review_purchase() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_partners_in_bounds(min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision, max_limit integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.prevent_cash_payment_method_delete() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_spv_stock_availability() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.check_address_limit() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.check_fraud_check_rate_limit(user_uuid uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.check_review_rate_limit(user_uuid uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.encrypt_sensitive_data(plaintext text, encryption_key text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_subscription_to_billing(sub_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.financial_next_run_date(p_frequency text, p_interval integer, p_current_run timestamp with time zone, p_start_date timestamp with time zone, p_week_days integer[], p_month_day integer, p_use_last_day boolean, p_year_month integer, p_year_day integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.generate_name_from_email(email text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.generate_order_number() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.generate_quote_number() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_address_owner_id(addr_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_full_address(p_street text, p_number text, p_complement text, p_neighborhood text, p_city text, p_state text, p_zip_code text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.get_partners_in_radius(center_lat double precision, center_lng double precision, radius_km double precision, max_limit integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.handle_order_payment() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.hash_backup_code() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.check_user_purchase() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.strip_html_tags(input text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.prevent_self_review() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.log_otp_changes() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.map_permissions_v2(input jsonb) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.map_permissions_v3(input jsonb, role text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sanitize_text(input text, max_length integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.sync_stock_availability_fields() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

COMMIT;
