-- Fix RLS INSERT policies for product_fiscal_profiles and product_logistics
-- Current policies only allow partner owners (partners.user_id = auth.uid())
-- but block team members (partner_users). Match the products table pattern.

BEGIN;

-- product_fiscal_profiles: fix INSERT policy
DROP POLICY IF EXISTS "Partner owners can insert fiscal profiles" ON public.product_fiscal_profiles;

CREATE POLICY "Partner owners can insert fiscal profiles"
  ON public.product_fiscal_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_fiscal_profiles.product_id
        AND p.partner_id IN (
          SELECT partners.id FROM public.partners WHERE partners.user_id = auth.uid()
          UNION
          SELECT partner_users.partner_id FROM public.partner_users
          WHERE partner_users.user_id = auth.uid()
            AND partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
        )
    )
  );

-- product_logistics: fix INSERT policy
DROP POLICY IF EXISTS "Partner owners can insert logistics" ON public.product_logistics;

CREATE POLICY "Partner owners can insert logistics"
  ON public.product_logistics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_logistics.product_id
        AND p.partner_id IN (
          SELECT partners.id FROM public.partners WHERE partners.user_id = auth.uid()
          UNION
          SELECT partner_users.partner_id FROM public.partner_users
          WHERE partner_users.user_id = auth.uid()
            AND partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
        )
    )
  );

COMMIT;
