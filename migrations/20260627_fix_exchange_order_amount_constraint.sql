-- Fix: exchange orders with store credit balance create total_amount=0,
-- which violates orders_positive_amount CHECK (total_amount > 0).
-- orders_total_positive CHECK (total_amount >= 0) already exists and is sufficient.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_positive_amount;
