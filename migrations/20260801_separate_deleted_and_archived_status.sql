-- ============================================================================
-- Migration: Separate Soft-Delete ('deleted') and Plan Archiving ('archived')
-- Author: Antigravity AI
-- Date: 2026-08-01
-- ============================================================================

-- 1. Ensure status column and soft delete columns exist on customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_reason TEXT NULL;

-- 2. Drop legacy status check constraints and re-add updated ones
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_status_check 
  CHECK (status IN ('ativo', 'inativo', 'bloqueado', 'arquivado', 'excluido', 'active', 'inactive', 'blocked', 'archived', 'deleted'));

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check 
  CHECK (status IN ('ativo', 'inativo', 'esgotado', 'arquivado', 'excluido', 'active', 'inactive', 'out_of_stock', 'archived', 'deleted'));

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_status_check;
ALTER TABLE public.services ADD CONSTRAINT services_status_check 
  CHECK (status IN ('ativo', 'inativo', 'arquivado', 'excluido', 'active', 'inactive', 'archived', 'deleted'));

-- 3. Update existing soft-deleted products and services to status = 'deleted'
UPDATE public.products SET status = 'deleted' WHERE deleted_at IS NOT NULL AND status IN ('archived', 'excluido', 'active', 'ativo');
UPDATE public.services SET status = 'deleted' WHERE deleted_at IS NOT NULL AND status IN ('archived', 'excluido', 'active', 'ativo');

-- 4. Unified Trigger Function to handle soft delete and restore metadata
-- NOTE: We do not touch NEW.is_active because products.is_active is a GENERATED ALWAYS STORED column in PostgreSQL.
CREATE OR REPLACE FUNCTION public.handle_soft_delete_by_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Transition to deleted status (Soft Delete)
  IF NEW.status IN ('deleted', 'excluido') AND (OLD.status IS NULL OR OLD.status NOT IN ('deleted', 'excluido')) THEN
    NEW.deleted_at := COALESCE(NEW.deleted_at, NOW());
    NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
  -- Transition to active or archived status (Restoration / Plan Archiving)
  ELSIF NEW.status IN ('active', 'ativo', 'archived', 'arquivado') THEN
    NEW.deleted_at := NULL;
    NEW.deleted_by := NULL;
    NEW.deleted_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Apply triggers and indexes to products
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products (partner_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_status_active ON public.products (partner_id, status) WHERE status IN ('active', 'ativo');
CREATE INDEX IF NOT EXISTS idx_products_status_archived ON public.products (partner_id, status) WHERE status IN ('archived', 'arquivado');

DROP TRIGGER IF EXISTS trg_soft_delete_user ON public.products;
CREATE TRIGGER trg_soft_delete_user 
  BEFORE UPDATE ON public.products 
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_soft_delete_by_user();

-- 6. Apply triggers and indexes to services
CREATE INDEX IF NOT EXISTS idx_services_deleted_at ON public.services (partner_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_services_status_active ON public.services (partner_id, status) WHERE status IN ('active', 'ativo');
CREATE INDEX IF NOT EXISTS idx_services_status_archived ON public.services (partner_id, status) WHERE status IN ('archived', 'arquivado');

DROP TRIGGER IF EXISTS trg_soft_delete_user ON public.services;
CREATE TRIGGER trg_soft_delete_user 
  BEFORE UPDATE ON public.services 
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_soft_delete_by_user();

-- 7. Apply triggers and indexes to customers
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers (partner_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_status_active ON public.customers (partner_id, status) WHERE status IN ('active', 'ativo');
CREATE INDEX IF NOT EXISTS idx_customers_status_archived ON public.customers (partner_id, status) WHERE status IN ('archived', 'arquivado');

DROP TRIGGER IF EXISTS trg_soft_delete_user ON public.customers;
CREATE TRIGGER trg_soft_delete_user 
  BEFORE UPDATE ON public.customers 
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_soft_delete_by_user();
