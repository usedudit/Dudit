-- Migration: Add indexes for barcode and product scanning system
-- Optimize GTIN and SKU lookups for products and variants.

CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);
CREATE INDEX IF NOT EXISTS idx_products_partner_gtin ON products(partner_id, gtin);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
