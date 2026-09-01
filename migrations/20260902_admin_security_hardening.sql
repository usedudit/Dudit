-- Admin security hardening
--
-- This migration only closes confirmed privilege/bypass paths. It does not
-- change the existing admin data model or remove unrelated RLS policies.

BEGIN;

-- The legacy seed value was published in the repository. Rotate it in any
-- existing installation while preserving deployments that already configured
-- their own token.
UPDATE public.system_settings
SET value = jsonb_set(
  value,
  '{bypass_token}',
  to_jsonb(('dudit_' || encode(gen_random_bytes(24), 'hex'))::text),
  true
),
updated_at = NOW()
WHERE key = 'maintenance'
  AND value->>'bypass_token' = 'dudit_sec_bypass';

UPDATE public.system_settings
SET is_public = false,
    updated_at = NOW()
WHERE key = 'maintenance';

-- Private settings (including the maintenance bypass credential) are visible
-- only to admins with the system_settings scope. Public clients retain access
-- to explicitly public settings such as the announcement banner.
DROP POLICY IF EXISTS allow_read_public_system_settings ON public.system_settings;
CREATE POLICY allow_read_public_system_settings ON public.system_settings
FOR SELECT
USING (
  is_public = true
  OR EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND (
        (role = 'super_admin' AND (COALESCE(cardinality(scopes), 0) = 0 OR 'system_settings' = ANY(scopes)))
        OR (role = 'admin' AND 'system_settings' = ANY(scopes))
      )
  )
);

DROP POLICY IF EXISTS allow_admin_update_system_settings ON public.system_settings;
CREATE POLICY allow_admin_update_system_settings ON public.system_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND (
        (role = 'super_admin' AND (COALESCE(cardinality(scopes), 0) = 0 OR 'system_settings' = ANY(scopes)))
        OR (role = 'admin' AND 'system_settings' = ANY(scopes))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND (
        (role = 'super_admin' AND (COALESCE(cardinality(scopes), 0) = 0 OR 'system_settings' = ANY(scopes)))
        OR (role = 'admin' AND 'system_settings' = ANY(scopes))
      )
  )
);

-- RLS policies decide which rows a moderator may update, but do not limit the
-- columns in an UPDATE. The admin server actions use the service role and
-- already apply their own allowlists; this trigger closes the direct
-- authenticated-client path for moderators without affecting normal partner
-- writes or trusted server actions.
CREATE OR REPLACE FUNCTION public.enforce_moderator_catalog_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND role = 'moderator'
  ) AND (
    (to_jsonb(NEW) - ARRAY['name', 'description', 'tags', 'video_url', 'updated_at'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['name', 'description', 'tags', 'video_url', 'updated_at'])
  ) THEN
    RAISE EXCEPTION 'Moderators may only update approved catalog content fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_moderator_products_update ON public.products;
CREATE TRIGGER enforce_moderator_products_update
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_moderator_catalog_update();

DROP TRIGGER IF EXISTS enforce_moderator_services_update ON public.services;
CREATE TRIGGER enforce_moderator_services_update
BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.enforce_moderator_catalog_update();

-- Keep the canonical admin audit table able to represent the resources used
-- by the financial and search-admin actions.
ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;
ALTER TABLE public.admin_audit_logs
ADD CONSTRAINT admin_audit_logs_target_type_check
CHECK (target_type IN (
  'user', 'partner', 'product', 'service', 'subscription',
  'system', 'review', 'return_request', 'advertisement',
  'marketplace_synonym_group', 'marketplace_synonym_term',
  'delivery_driver', 'community_video', 'refund_request', 'purchase', 'payment'
));

-- The legacy 11-argument return processor is an internal compatibility
-- overload. The 13-argument overload performs its own RPC-context check; the
-- 11-argument overload is only called through the server action with the
-- service-role client and must not be callable by end users.
REVOKE EXECUTE ON FUNCTION public.process_return_request(
  UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_return_request(
  UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT
) TO service_role;

COMMIT;
