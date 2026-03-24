-- Add variant_id column to cart_items for variant product support
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- Drop old unique constraint (user_id, product_id only)
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;

-- New unique constraint: same user can have same product with different variants
-- Uses COALESCE to handle NULL variant_id (plain products) properly
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_user_product_variant_key 
  ON cart_items (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'));

-- Index for variant lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON cart_items(variant_id) WHERE variant_id IS NOT NULL;
