-- Expand address_type to support marketplace user labels
-- ERP keeps: 'primary', 'billing'
-- Marketplace users: 'casa', 'trabalho', 'outro'

-- Drop existing constraint if any and recreate with expanded values
DO $$
BEGIN
  -- Try to drop any existing constraint on address_type
  ALTER TABLE public.addresses DROP CONSTRAINT IF EXISTS addresses_address_type_check;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- No CHECK constraint needed - address_type is a free-text varchar.
-- The application layer enforces valid values per entity type.

-- Backfill: set existing user addresses without a type to 'casa'
UPDATE public.addresses
SET address_type = 'casa'
WHERE user_id IS NOT NULL
  AND (address_type IS NULL OR address_type = 'primary');
