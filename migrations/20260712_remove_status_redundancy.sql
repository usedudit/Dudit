-- ============================================================================
-- Migration: Remove Status Redundancy in Soft-Delete Architecture
-- Author: Antigravity AI
-- Date: 2026-07-12
-- ============================================================================

-- 1. Drop redundant status columns
ALTER TABLE public.products DROP COLUMN IF EXISTS status;
ALTER TABLE public.services DROP COLUMN IF EXISTS status;

-- 2. Drop redundant indexes
DROP INDEX IF EXISTS public.products_status_idx;
DROP INDEX IF EXISTS public.services_status_idx;

-- 3. Update trigger function to rely entirely on deleted_at transitions
CREATE OR REPLACE FUNCTION public.handle_soft_delete_by_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Transition to archived (deleted_at transitions from NULL to a timestamp)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  -- Transition to active/restoration (deleted_at transitions from a timestamp to NULL)
  ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_by := NULL;
    NEW.deleted_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
