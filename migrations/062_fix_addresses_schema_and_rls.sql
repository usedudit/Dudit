BEGIN;

-- 1. Add missing address_type column to addresses
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS address_type TEXT DEFAULT 'primary';

-- 2. Drop the existing broken policies
DROP POLICY IF EXISTS "Users can view their own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can create their own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can update their own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can delete their own addresses" ON addresses;

-- 3. Create helper function for address authorization (better performance than complex coalesce)
CREATE OR REPLACE FUNCTION get_address_partner_id(
  p_partner_id UUID, 
  p_supplier_id UUID, 
  p_customer_id UUID, 
  p_store_id UUID
) RETURNS UUID AS $$
BEGIN
  IF p_partner_id IS NOT NULL THEN
    RETURN p_partner_id;
  ELSIF p_supplier_id IS NOT NULL THEN
    RETURN (SELECT partner_id FROM suppliers WHERE id = p_supplier_id);
  ELSIF p_customer_id IS NOT NULL THEN
    RETURN (SELECT partner_id FROM customers WHERE id = p_customer_id);
  ELSIF p_store_id IS NOT NULL THEN
    RETURN (SELECT partner_id FROM stores WHERE id = p_store_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate policies utilizing the helper function and checking partner_users
CREATE POLICY "Users can view their own addresses"
  ON addresses FOR SELECT
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM partners p 
      WHERE p.id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND p.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM partner_users pu 
      WHERE pu.partner_id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own addresses"
  ON addresses FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM partners p 
      WHERE p.id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND p.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM partner_users pu 
      WHERE pu.partner_id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own addresses"
  ON addresses FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM partners p 
      WHERE p.id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND p.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM partner_users pu 
      WHERE pu.partner_id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own addresses"
  ON addresses FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM partners p 
      WHERE p.id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND p.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM partner_users pu 
      WHERE pu.partner_id = get_address_partner_id(partner_id, supplier_id, customer_id, store_id) 
      AND pu.user_id = auth.uid()
    )
  );

COMMIT;
