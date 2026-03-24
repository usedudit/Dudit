-- Fix RLS policies for product_variants table
-- The original policies used auth.users.partner_id which doesn't exist

-- Drop existing broken policies
DROP POLICY IF EXISTS "Parceiros podem ver suas variantes" ON product_variants;
DROP POLICY IF EXISTS "Parceiros podem criar variantes" ON product_variants;
DROP POLICY IF EXISTS "Parceiros podem atualizar variantes" ON product_variants;
DROP POLICY IF EXISTS "Parceiros podem deletar variantes" ON product_variants;

-- Create corrected RLS policies using the same pattern as products table

-- Allow authenticated users to SELECT variants of their products
CREATE POLICY "product_variants_select_own"
ON product_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM products
    JOIN partners ON partners.id = products.partner_id
    WHERE products.id = product_variants.product_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow authenticated users to INSERT variants (verification done in server action)
CREATE POLICY "product_variants_insert_authenticated"
ON product_variants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to UPDATE their own product variants
CREATE POLICY "product_variants_update_own"
ON product_variants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM products
    JOIN partners ON partners.id = products.partner_id
    WHERE products.id = product_variants.product_id
    AND partners.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM products
    JOIN partners ON partners.id = products.partner_id
    WHERE products.id = product_variants.product_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow users to DELETE their own product variants
CREATE POLICY "product_variants_delete_own"
ON product_variants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM products
    JOIN partners ON partners.id = products.partner_id
    WHERE products.id = product_variants.product_id
    AND partners.user_id = auth.uid()
  )
);
