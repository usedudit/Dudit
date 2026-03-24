-- Add store_id column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

-- Add store_id column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);

-- Add store_id column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);

-- Add store_id column to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_store_id ON services(store_id);

-- Add store_id column to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);

-- Add store_id column to stock_movements table
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON stock_movements(store_id);

-- Add store_id column to cart_items table
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cart_items_store_id ON cart_items(store_id);

-- Add store_id column to payment_methods table
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_store_id ON payment_methods(store_id);

-- Add store_id column to reviews table (for store-specific reviews)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_store_id ON reviews(store_id);

-- Add store_id column to product_kits table
ALTER TABLE product_kits ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_kits_store_id ON product_kits(store_id);
