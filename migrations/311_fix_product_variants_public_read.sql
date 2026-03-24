-- Fix: Allow any authenticated user to read active product variants
-- Currently only the partner (owner) can SELECT, which blocks buyers from adding variants to cart

-- Drop the owner-only select policy
DROP POLICY IF EXISTS "product_variants_select_own" ON product_variants;

-- Create public read policy for active variants (buyers need to read them)
CREATE POLICY "product_variants_select_public"
ON product_variants
FOR SELECT
TO authenticated
USING (is_active = true);

-- Owners can also see their inactive variants (for management)
CREATE POLICY "product_variants_select_own_all"
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
