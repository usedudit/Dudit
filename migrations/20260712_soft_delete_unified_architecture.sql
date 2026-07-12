-- ============================================================================
-- Migration: Unified Soft-Delete Architecture - Phase 1 (Products & Services)
-- Author: Antigravity AI
-- Date: 2026-07-12
-- ============================================================================

-- 1. Add status column to products and services
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

-- 2. Backfill existing soft-deleted items (moderated or previously marked)
UPDATE public.products SET status = 'archived' WHERE deleted_at IS NOT NULL;
UPDATE public.services SET status = 'archived' WHERE deleted_at IS NOT NULL;

-- 3. Trigger function to set soft-delete metadata and handle restoration
CREATE OR REPLACE FUNCTION public.handle_soft_delete_by_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Transition to archived status
  IF NEW.status = 'archived' AND OLD.status = 'active' THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, NOW());
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  -- Transition to active status (Restoration)
  ELSIF NEW.status = 'active' AND OLD.status = 'archived' THEN
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
    NEW.deleted_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Apply triggers and indexes to products
CREATE INDEX IF NOT EXISTS products_deleted_at_idx ON public.products (partner_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_status_idx ON public.products (partner_id, status) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_soft_delete_user ON public.products;
CREATE TRIGGER trg_soft_delete_user 
  BEFORE UPDATE ON public.products 
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_soft_delete_by_user();

-- 5. Apply triggers and indexes to services
CREATE INDEX IF NOT EXISTS services_deleted_at_idx ON public.services (partner_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_status_idx ON public.services (partner_id, status) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_soft_delete_user ON public.services;
CREATE TRIGGER trg_soft_delete_user 
  BEFORE UPDATE ON public.services 
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_soft_delete_by_user();
