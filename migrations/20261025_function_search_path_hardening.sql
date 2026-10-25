-- Harden non-definer trigger and helper functions reported by Supabase
-- Security Advisors. Explicit search_path prevents object-shadowing attacks.

BEGIN;

ALTER FUNCTION public.browse_marketplace_by_score(text, integer, real, uuid, uuid[], uuid[])
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.calc_store_marketplace_reputation(integer, integer, integer, numeric, numeric, numeric)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.create_order_transaction_on_paid()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.delivery_drivers_set_updated_at()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.generate_short_id(integer)
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_short_id_if_null()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.trg_stores_marketplace_fts()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.trg_stores_refresh_product_fts()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_partner_rating_from_all_items()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_partner_rating()
  SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, extensions, pg_temp;

COMMIT;
