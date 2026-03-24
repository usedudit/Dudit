-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "products_insert_own" ON products;
DROP POLICY IF EXISTS "products_update_own" ON products;
DROP POLICY IF EXISTS "products_delete_own" ON products;

-- Allow authenticated users to insert products if they own the partner
CREATE POLICY "products_insert_own" ON products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow users to update their own partner's products
CREATE POLICY "products_update_own" ON products
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
);

-- Allow users to delete their own partner's products
CREATE POLICY "products_delete_own" ON products
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
);

-- Verify the user is authenticated before allowing operations
-- This ensures that auth.uid() will return a valid user ID
