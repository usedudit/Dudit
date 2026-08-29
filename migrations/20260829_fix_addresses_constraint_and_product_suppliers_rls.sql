-- Fix 1: Relax check_address_type constraint
-- The constraint requires exactly 1 FK to be non-null, but inserts
-- with supplier_id + user_id (or other combos) fail because sum = 2.
-- Change to allow >= 1 (at least one FK reference).
ALTER TABLE public.addresses
  DROP CONSTRAINT IF EXISTS check_address_type;

ALTER TABLE public.addresses
  ADD CONSTRAINT check_address_type CHECK (
    (user_id IS NOT NULL)::int +
    (partner_id IS NOT NULL)::int +
    (supplier_id IS NOT NULL)::int +
    (customer_id IS NOT NULL)::int +
    (store_id IS NOT NULL)::int >= 1
  );

-- Fix 2: Rewrite product_suppliers RLS policies
-- The old policies referenced auth.users directly, causing
-- "permission denied for table users" for anon/authenticated roles.
-- Rewrite to go through partners table instead.

DROP POLICY IF EXISTS "Parceiros podem ver fornecedores de seus produtos" ON public."product_suppliers";
CREATE POLICY "Parceiros podem ver fornecedores de seus produtos" ON public."product_suppliers"
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_suppliers.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem vincular fornecedores" ON public."product_suppliers";
CREATE POLICY "Parceiros podem vincular fornecedores" ON public."product_suppliers"
  FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_suppliers.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem atualizar fornecedores" ON public."product_suppliers";
CREATE POLICY "Parceiros podem atualizar fornecedores" ON public."product_suppliers"
  FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_suppliers.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem deletar fornecedores de produtos" ON public."product_suppliers";
CREATE POLICY "Parceiros podem deletar fornecedores de produtos" ON public."product_suppliers"
  FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_suppliers.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

-- Also fix product_variants RLS (same pattern - references auth.users)
DROP POLICY IF EXISTS "Parceiros podem ver suas variantes" ON public."product_variants";
CREATE POLICY "Parceiros podem ver suas variantes" ON public."product_variants"
  FOR SELECT TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem criar variantes" ON public."product_variants";
CREATE POLICY "Parceiros podem criar variantes" ON public."product_variants"
  FOR INSERT TO public WITH CHECK (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem atualizar variantes" ON public."product_variants";
CREATE POLICY "Parceiros podem atualizar variantes" ON public."product_variants"
  FOR UPDATE TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Parceiros podem deletar variantes" ON public."product_variants";
CREATE POLICY "Parceiros podem deletar variantes" ON public."product_variants"
  FOR DELETE TO public USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.partner_id IN (
          SELECT id FROM partners WHERE user_id = (SELECT auth.uid())
        )
    )
  );
