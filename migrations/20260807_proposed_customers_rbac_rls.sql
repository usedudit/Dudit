-- ============================================================================
-- PROPOSTA — RLS/RBAC de customers
--
-- NÃO APLICAR AINDA.
--
-- Pré-requisito obrigatório:
--   Migrar os consumidores diretos de customers usados por operator/delivery
--   para customers_operator_safe/customers_delivery_safe ou para ações/RPCs
--   com autorização server-side. RLS é row-level e não protege colunas PII.
--
-- Este arquivo é o desenho da migration para revisão. Ele consolida as
-- policies, alinha mutações ao role_id canônico, exige membership ativa e
-- parceiro habilitado, e impede troca de partner_id por trigger.
-- ============================================================================

BEGIN;

-- A migration não adiciona colunas silenciosamente. Se a instalação não tiver
-- o modelo RBAC atual, a aplicação deve parar para evitar uma policy parcial.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_users'
      AND column_name = 'role_id'
  ) THEN
    RAISE EXCEPTION 'customers RLS proposal requires public.partner_users.role_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_users'
      AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'customers RLS proposal requires public.partner_users.is_active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partners'
      AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'customers RLS proposal requires public.partners.is_active';
  END IF;
END;
$$;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

-- Remove every known legacy/duplicate policy before creating one explicit
-- policy per operation. No permissive policy remains to widen access by OR.
DROP POLICY IF EXISTS "Partner owners can view customers" ON public.customers;
DROP POLICY IF EXISTS customers_select_own ON public.customers;
DROP POLICY IF EXISTS customers_select_policy ON public.customers;
DROP POLICY IF EXISTS customers_insert_own ON public.customers;
DROP POLICY IF EXISTS customers_insert_policy ON public.customers;
DROP POLICY IF EXISTS customers_update_own ON public.customers;
DROP POLICY IF EXISTS customers_delete_own ON public.customers;
DROP POLICY IF EXISTS customers_delete_policy ON public.customers;

-- Policies run as the caller and therefore can be blocked by RLS on
-- partner_users/partners while evaluating their own authorization predicate.
-- This boolean-only SECURITY DEFINER helper reads those two authorization
-- tables under a fixed search_path and does not return business data.
CREATE OR REPLACE FUNCTION public.customers_has_rbac_access(
  p_partner_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.partners p ON p.id = pu.partner_id
    WHERE pu.partner_id = p_partner_id
      AND pu.user_id = (SELECT auth.uid())
      AND pu.is_active IS TRUE
      AND p.is_active IS TRUE
      AND COALESCE(p.erp_disabled, FALSE) IS FALSE
      AND pu.role_id = ANY (p_roles)
      AND (pu.role_id <> 'owner' OR p.user_id = (SELECT auth.uid()))
  );
$$;

REVOKE ALL ON FUNCTION public.customers_has_rbac_access(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customers_has_rbac_access(uuid, text[]) TO authenticated;

-- Full table SELECT is limited to profiles that need the operational PII.
CREATE POLICY customers_select_privileged
  ON public.customers
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.customers_has_rbac_access(
    customers.partner_id,
    ARRAY['owner', 'admin', 'manager']::text[]
  ));

-- RBAC: owner/admin/manager/operator can create customers. The operator
-- application path must use a validated action/RPC after this proposal is
-- applied, because operator has no base-table SELECT policy for PII safety.
CREATE POLICY customers_insert_rbac
  ON public.customers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.customers_has_rbac_access(
    customers.partner_id,
    ARRAY['owner', 'admin', 'manager', 'operator']::text[]
  ));

-- RBAC: owner/admin/manager/operator can edit. WITH CHECK repeats the
-- authorization for the new row; the trigger below is the authoritative
-- protection against changing the tenant key on UPDATE.
CREATE POLICY customers_update_rbac
  ON public.customers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.customers_has_rbac_access(
    customers.partner_id,
    ARRAY['owner', 'admin', 'manager', 'operator']::text[]
  ))
  WITH CHECK (public.customers_has_rbac_access(
    customers.partner_id,
    ARRAY['owner', 'admin', 'manager', 'operator']::text[]
  ));

-- RBAC: owner/admin/manager can delete. Operator and delivery cannot.
CREATE POLICY customers_delete_rbac
  ON public.customers
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.customers_has_rbac_access(
    customers.partner_id,
    ARRAY['owner', 'admin', 'manager']::text[]
  ));

-- RLS cannot compare OLD and NEW values. This trigger closes the tenant-key
-- mutation gap that a WITH CHECK policy alone cannot close.
CREATE OR REPLACE FUNCTION public.prevent_customer_partner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
    RAISE EXCEPTION 'customers.partner_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_customer_partner_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS customers_partner_id_immutable ON public.customers;
CREATE TRIGGER customers_partner_id_immutable
  BEFORE UPDATE OF partner_id ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_partner_change();

-- Limited projections for roles that have customers.view but must not read the
-- operational table's PII. Views are security-barrier and enforce tenant,
-- membership and partner status using auth.uid(). `security_invoker = false`
-- is deliberate: setting it to true would re-apply the base-table SELECT RLS
-- and hide these projections from operator/delivery. The boolean-only helper
-- is the explicit authorization boundary; it must remain SECURITY DEFINER with
-- the fixed search_path above and must never return customer data.
DROP VIEW IF EXISTS public.customers_operator_safe;
CREATE VIEW public.customers_operator_safe
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  c.id,
  c.partner_id,
  c.name,
  c.email,
  c.phone,
  c.image_url,
  c.status,
  c.person_type,
  c.store_credit,
  c.created_at
FROM public.customers c
WHERE public.customers_has_rbac_access(c.partner_id, ARRAY['operator']::text[]);

DROP VIEW IF EXISTS public.customers_delivery_safe;
CREATE VIEW public.customers_delivery_safe
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  c.id,
  c.partner_id,
  c.name,
  c.email,
  c.phone,
  c.image_url
FROM public.customers c
WHERE public.customers_has_rbac_access(c.partner_id, ARRAY['delivery']::text[]);

GRANT SELECT ON public.customers_operator_safe TO authenticated;
GRANT SELECT ON public.customers_delivery_safe TO authenticated;

-- Client roles do not need public table access or schema capabilities that can
-- create/alter relationships. service_role grants are intentionally preserved.
REVOKE ALL ON public.customers FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.customers FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;

CREATE INDEX IF NOT EXISTS idx_partner_users_customers_rls
  ON public.partner_users (user_id, partner_id, role_id, is_active);

COMMIT;
