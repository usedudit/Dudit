-- Remove redundant indexes flagged by Supabase's performance advisor.
-- Each removed index has an identical surviving index; unique constraints and
-- query coverage remain intact while writes maintain fewer index copies.

DROP INDEX IF EXISTS public.idx_quotes_public_token_clean;
DROP INDEX IF EXISTS public.idx_return_items_request;
DROP INDEX IF EXISTS public.idx_sales_goal_progress_goal_user;
DROP INDEX IF EXISTS public.idx_service_orders_public_token_clean;
DROP INDEX IF EXISTS public.idx_stores_slug;
DROP INDEX IF EXISTS public.user_profiles_user_id_unique_idx;
