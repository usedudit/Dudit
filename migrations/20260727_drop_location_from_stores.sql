-- Migration: Remove latitude, longitude, address_id from stores
-- Description: Single source of truth for coordinates is now the addresses table

DROP INDEX IF EXISTS idx_stores_coordinates;

ALTER TABLE stores
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude,
  DROP COLUMN IF EXISTS address_id;
