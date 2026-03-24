-- ============================================================================
-- Migration: Add unique constraints to partners table
-- Purpose: Enforce database-level uniqueness for user_id and store_name
-- ============================================================================

-- Prevent duplicate partner accounts for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_user_id_unique
  ON partners(user_id);

-- Prevent duplicate store names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_store_name_unique
  ON partners(lower(store_name));
