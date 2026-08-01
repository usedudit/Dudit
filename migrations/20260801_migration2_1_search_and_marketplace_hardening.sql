-- ==============================================================================
-- MIGRATION 2.1: HARDENING SEARCH_PATH (BUSCA & MARKETPLACE)
-- Data: 2026-08-01
-- Projeto: Dudit
-- Descrição: 
--   1. Trava o search_path em public, extensions, pg_temp em 30 funções SECURITY INVOKER
--      do módulo de Busca e Marketplace.
--   2. Usa blocos PL/pgSQL resilientes com EXCEPTION para garantir compatibilidade total.
-- ==============================================================================

BEGIN;

DO $$
BEGIN
  BEGIN ALTER FUNCTION public.mp_store_risk_rank_multiplier(p_risk_score integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_store_risk_is_hidden(p_risk_score integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_partner_risk_is_hidden(p_risk_score integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.calc_store_marketplace_reputation(p_completed_orders integer, p_completed_appointments integer, p_active_subscriptions integer, p_rating numeric, p_cancellation_rate numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.search_marketplace(p_query text, p_type text, p_limit integer, p_cursor_rank real, p_cursor_id uuid, p_partner_ids uuid[], p_store_ids uuid[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.normalize_search_text(input text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.expand_marketplace_search_terms(p_tokens text[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.build_marketplace_tsquery(p_query text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_search_text_matches_any(haystack text, needles text[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_search_category_boost(p_category text, p_subcategory text, p_expanded text[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_compute_search_rank(p_name text, p_norm_query text, p_tokens text[], p_expanded text[], p_category text, p_subcategory text, p_fts tsvector, p_tsq tsquery, p_marketplace_score numeric, p_rating numeric, p_sales_30d integer, p_created_at timestamp with time zone) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_search_row_matches(p_name text, p_category text, p_subcategory text, p_fts tsvector, p_tsq tsquery, p_norm_query text, p_tokens text[], p_expanded text[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.marketplace_search_autocomplete(p_query text, p_type text, p_limit integer, p_partner_ids uuid[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_partner_risk_rank_multiplier(p_risk_score integer) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.refresh_product_marketplace_fts(p_product_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.refresh_service_marketplace_fts(p_service_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.refresh_recurring_plan_marketplace_fts(p_plan_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.refresh_partner_marketplace_fts(p_partner_id uuid) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.browse_marketplace_by_score(p_type text, p_limit integer, p_cursor_score real, p_cursor_id uuid, p_partner_ids uuid[], p_store_ids uuid[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.build_marketplace_tsvector(p_name text, p_category text, p_subcategory text, p_tags text, p_description text, p_store text, p_sku text) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.trg_products_marketplace_fts() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.trg_mp_category_refresh_product_fts() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.trg_services_marketplace_fts() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.trg_recurring_plans_marketplace_fts() SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.mp_freshness_factor(p_created_at timestamp with time zone) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.calc_product_marketplace_score(p_sales_30d integer, p_views_30d integer, p_favorites integer, p_created_at timestamp with time zone, p_rating numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.calc_service_marketplace_score(p_bookings_30d integer, p_views integer, p_favorites integer, p_created_at timestamp with time zone, p_rating numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.calc_plan_marketplace_score(p_signups_30d integer, p_views integer, p_favorites integer, p_created_at timestamp with time zone, p_rating numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.calc_partner_marketplace_reputation(p_completed_orders integer, p_completed_appointments integer, p_active_subscriptions integer, p_rating numeric, p_cancellation_rate numeric) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN ALTER FUNCTION public.search_marketplace_fts(p_query text, p_type text, p_limit integer, p_cursor_rank real, p_cursor_id uuid, p_partner_ids uuid[], p_store_ids uuid[]) SET search_path = public, extensions, pg_temp; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;

COMMIT;
