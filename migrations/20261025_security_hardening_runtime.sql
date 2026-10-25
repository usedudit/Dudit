-- Runtime security hardening for installations whose migration history drifted
-- from the repository. This removes anonymous access to SECURITY DEFINER RPCs,
-- fixes mutable search paths, and restores only the intentionally public RPCs.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  fn RECORD;
  public_rpc text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn.signature);
  END LOOP;

  -- These are the only SECURITY DEFINER functions intentionally callable by
  -- anonymous marketplace/approval clients. They return public projections or
  -- accept possession-based public links; no tenant or financial mutation RPC
  -- is re-exposed here.
  FOREACH public_rpc IN ARRAY ARRAY[
    'public.get_marketplace_products_public(uuid[],uuid)',
    'public.get_marketplace_services_public(uuid[],uuid)',
    'public.approve_public_quote(uuid,text,text,text,text,text)',
    'public.reject_public_quote(uuid,text,text,text,text,text,text)',
    'public.sign_public_service_order(uuid,text,text,text,text,text,text)',
    'public.increment_ad_impression(uuid)',
    'public.increment_ad_click(uuid)',
    'public.increment_collection_views(uuid)',
    'public.increment_community_video_views(uuid)',
    'public.increment_community_video_clicks(uuid)',
    'public.increment_marketplace_view(text,uuid)'
  ]
  LOOP
    IF to_regprocedure(public_rpc) IS NOT NULL THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
        to_regprocedure(public_rpc)
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
