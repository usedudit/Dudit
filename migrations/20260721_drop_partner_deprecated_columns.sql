-- Migration: Remove deprecated columns and indexes from partners table
-- Date: 2026-07-21

ALTER TABLE partners DROP COLUMN IF EXISTS logo_moderation_status;
ALTER TABLE partners DROP COLUMN IF EXISTS banner_moderation_status;
ALTER TABLE partners DROP COLUMN IF EXISTS max_installments;
ALTER TABLE partners DROP COLUMN IF EXISTS installments_without_interest;
ALTER TABLE partners DROP COLUMN IF EXISTS interest_rate_percent;

DROP INDEX IF EXISTS idx_partners_logo_moderation;
DROP INDEX IF EXISTS idx_partners_banner_moderation;
