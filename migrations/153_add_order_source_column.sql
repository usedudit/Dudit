-- Add order_source column to track where the order came from
-- Default to 'Vitrine Online' for now

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(50) DEFAULT 'Vitrine Online';
