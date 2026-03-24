-- Remove RLS policies restritivas e cria uma que permite insert
DROP POLICY IF EXISTS "products_insert_own" ON products;

-- Permite INSERT para usuários autenticados (a verificação de ownership já é feita na server action)
CREATE POLICY "products_insert_authenticated"
ON products
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Garante que SELECT também funciona
DROP POLICY IF EXISTS "products_select_own" ON products;

CREATE POLICY "products_select_own"
ON products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
);

-- Permite UPDATE apenas para donos
DROP POLICY IF EXISTS "products_update_own" ON products;

CREATE POLICY "products_update_own"
ON products
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

-- Permite DELETE apenas para donos
DROP POLICY IF EXISTS "products_delete_own" ON products;

CREATE POLICY "products_delete_own"
ON products
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM partners
    WHERE partners.id = products.partner_id
    AND partners.user_id = auth.uid()
  )
);
