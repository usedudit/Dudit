-- SCRIPT: UPDATE STOCK MOVEMENTS CHECK CONSTRAINT
-- This migration updates the movement_type check constraint to include 'in' and 'out'
-- which are used by the manual stock movement RPC and frontend.

-- 1. Drop existing constraint
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

-- 2. Add updated constraint
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type IN ('sale', 'return', 'adjustment', 'purchase', 'damage', 'loss', 'in', 'out'));

-- 3. Update the RPC to use the correct UUID type for p_created_by if not already correct
-- (Migration 052 already did this, but we ensure consistency here if needed)
-- No changes needed to the RPC itself as it already handles 'in' and 'out' logic.
