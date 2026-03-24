-- Add missing product fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS packaging_type TEXT DEFAULT 'package';
ALTER TABLE products ADD COLUMN IF NOT EXISTS preparation_days INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_sell_without_stock BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_index INTEGER DEFAULT 0;
