-- Migration: Drop global unique constraint on products.sku
-- Coexistence with multi-store/multi-partner architecture where SKUs are unique per partner (enforced by idx_products_partner_sku_unique).

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
