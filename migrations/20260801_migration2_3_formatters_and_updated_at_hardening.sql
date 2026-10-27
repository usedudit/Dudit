-- ==============================================================================
-- MIGRATION 2.3: HARDENING SEARCH_PATH (FORMATADORES & TRIGGERS UPDATED_AT)
-- Data: 2026-08-01 | Projeto: Dudit
-- Descrição: 
--   1. Trava o search_path em public, extensions, pg_temp nas 19 funções SECURITY INVOKER
--      utilitárias, formatadores de texto e triggers de updated_at da Dudit.
--   2. Exclui estritamente todas as 35 funções internas de extensão (pg_trgm, unaccent).
--   3. Usa blocos PL/pgSQL resilientes com EXCEPTION para garantir compatibilidade total.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
  BEGIN ALTER FUNCTION public.return_status_label_pt(p_status text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.return_event_message_pt(p_action text, p_old_status text, p_new_status text, p_refund_amount numeric, p_credit_amount numeric, p_return_to_inventory boolean) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_billing_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_service_orders_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.set_services_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.set_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_addresses_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_user_profiles_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_appointment_items_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_partner_rating_from_all_items() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_partner_rating() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.set_appointments_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.set_order_number() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.set_service_categories_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_product_fiscal_profiles_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_product_logistics_updated_at() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_product_rating() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_user_preferences_timestamp() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

COMMIT;
