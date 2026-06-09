-- Re-add columns dropped by migration 151 that are still used by the code
-- These were supposed to be re-added by migration 152 but may not have been applied

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_date_approved TIMESTAMP WITH TIME ZONE;
