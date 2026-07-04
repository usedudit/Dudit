-- ============================================================================
-- Migration: 20260703_fix_product_variants_rls_team_access.sql
--
-- Security fix (tenant isolation / BOLA hardening) for product_variants.
--
-- Context:
--   Migration 950 (HIGH-02) aligned products/services/customers/orders RLS with
--   the team model (partners.user_id OR partner_users, with role gating on
--   mutations). product_variants was NOT included and still carried the legacy
--   policies from migrations 220 / 311:
--     * INSERT: WITH CHECK (true)  -> ANY authenticated user could insert a
--       variant referencing ANY product_id, i.e. a direct cross-tenant write
--       straight against the DB, bypassing the application layer entirely.
--     * UPDATE / DELETE: owner-only (partners.user_id = auth.uid()) -> ignored
--       partner_users, so legitimate team members could not manage variants and
--       RLS was not a reliable second layer for RLS-scoped client paths.
--
-- This migration:
--   1. Keeps public SELECT of ACTIVE variants (buyers add them to cart).
--   2. Lets owner + ANY team member SELECT all variants (incl. inactive) for mgmt.
--   3. Restricts INSERT/UPDATE/DELETE to owner + partner_users with an
--      appropriate role, derived via the parent product's partner_id.
--
-- Role model mirrors migration 950:
--   INSERT / UPDATE -> OWNER, ADMIN, MANAGER
--   DELETE          -> OWNER, ADMIN
-- ============================================================================

BEGIN;

-- Ensure RLS is on (no-op if already enabled).
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- ─── SELECT ────────────────────────────────────────────────────────────────
-- Public read of active variants (buyers/checkout need this).
DROP POLICY IF EXISTS "product_variants_select_public" ON public.product_variants;
CREATE POLICY "product_variants_select_public"
ON public.product_variants
FOR SELECT
TO authenticated
USING (is_active = true);

-- Owner + team members can read ALL variants of their partner's products.
DROP POLICY IF EXISTS "product_variants_select_own" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_select_own_all" ON public.product_variants;
CREATE POLICY "product_variants_select_own_all"
ON public.product_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.partner_id IN (
        SELECT id FROM public.partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
      )
  )
);

-- ─── INSERT ──────────────────────────────────────────────────────────────
-- Replaces the dangerous WITH CHECK (true). The variant's parent product must
-- belong to a partner the caller owns or is a privileged member of.
DROP POLICY IF EXISTS "product_variants_insert_authenticated" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_insert_own" ON public.product_variants;
CREATE POLICY "product_variants_insert_own"
ON public.product_variants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.partner_id IN (
        SELECT id FROM public.partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM public.partner_users
          WHERE user_id = auth.uid()
          AND role IN ('OWNER', 'ADMIN', 'MANAGER')
      )
  )
);

-- ─── UPDATE ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "product_variants_update_own" ON public.product_variants;
CREATE POLICY "product_variants_update_own"
ON public.product_variants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.partner_id IN (
        SELECT id FROM public.partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM public.partner_users
          WHERE user_id = auth.uid()
          AND role IN ('OWNER', 'ADMIN', 'MANAGER')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.partner_id IN (
        SELECT id FROM public.partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM public.partner_users
          WHERE user_id = auth.uid()
          AND role IN ('OWNER', 'ADMIN', 'MANAGER')
      )
  )
);

-- ─── DELETE ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "product_variants_delete_own" ON public.product_variants;
CREATE POLICY "product_variants_delete_own"
ON public.product_variants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.partner_id IN (
        SELECT id FROM public.partners WHERE user_id = auth.uid()
        UNION
        SELECT partner_id FROM public.partner_users
          WHERE user_id = auth.uid()
          AND role IN ('OWNER', 'ADMIN')
      )
  )
);

-- ─── Supporting index ─────────────────────────────────────────────────────
-- Keeps the parent-product lookup in every policy fast.
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);

COMMIT;
