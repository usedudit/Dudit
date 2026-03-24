-- SECURITY FIX (MED-03): Ensure order deletion cascades to order_items
-- Prevents orphaned order_items when an order is deleted.
-- The existing deleteOrderAction already performs manual cleanup,
-- but this ensures database-level referential integrity.

-- Step 1: Drop existing FK (name may vary; adjust if needed)
ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;

-- Step 2: Re-add FK with ON DELETE CASCADE
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id)
  ON DELETE CASCADE;

-- Also cascade stock_movements linked to orders
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_order_id_fkey;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id)
  ON DELETE CASCADE;
