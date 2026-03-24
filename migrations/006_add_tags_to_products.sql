-- Add tags column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add index for tags array search
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);

-- Comment on the new column
COMMENT ON COLUMN products.tags IS 'Array of product tags for categorization and filtering';
