-- Add partners.business_info.mode and remove legacy business_info.channels safely
-- Compatibility: old users default to mode="erp"

BEGIN;

-- Ensure column exists with a sane default
ALTER TABLE partners
  ALTER COLUMN business_info SET DEFAULT '{"sells": ["products"], "mode": "erp"}'::jsonb;

-- Backfill mode where missing (default erp)
UPDATE partners
SET business_info = jsonb_set(
  COALESCE(business_info, '{}'::jsonb),
  '{mode}',
  '"erp"'::jsonb,
  true
)
WHERE business_info IS NULL
   OR (business_info ? 'mode') IS FALSE;

-- Drop channels key if present
UPDATE partners
SET business_info = business_info - 'channels'
WHERE business_info ? 'channels';

COMMIT;

