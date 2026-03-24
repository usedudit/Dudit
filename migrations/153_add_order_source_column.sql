-- Add order_source column to track where the order came from
-- Default to 'Marketplace' for now

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(50) DEFAULT 'Marketplace';
