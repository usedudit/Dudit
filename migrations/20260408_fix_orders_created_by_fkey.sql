-- Fix orders.created_by foreign key constraint
-- The column was referencing profiles(id), but profiles table was dropped.
-- Update the FK to reference auth.users(id) instead.

-- Step 1: Add the column if it doesn't exist (it may have been added ad-hoc)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by UUID;

-- Step 2: Drop the broken FK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_created_by_fkey;

-- Step 3: Re-add the FK referencing auth.users(id)
ALTER TABLE orders
  ADD CONSTRAINT orders_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
