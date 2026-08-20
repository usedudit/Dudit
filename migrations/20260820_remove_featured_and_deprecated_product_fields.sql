-- ==============================================================================
-- Migration: Remove featured/highlight columns from products and services
-- Date: 2026-08-20
-- ==============================================================================

-- 1. Remove featured index and column from products
DROP INDEX IF EXISTS idx_products_is_featured;

ALTER TABLE public.products 
    DROP COLUMN IF EXISTS is_featured;

-- 2. Remove highlight_service from services
ALTER TABLE public.services 
    DROP COLUMN IF EXISTS highlight_service;
