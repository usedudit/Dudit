-- Adicionar campos de marketplace aos produtos
-- Execute este script no Supabase

-- 1. Adicionar campos básicos do marketplace
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS availability text DEFAULT 'in_stock';
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url text;

-- 2. Adicionar ficha técnica (technical specs) como JSONB
-- Formato: { "attr1": { "name": "Cor", "value": "Azul" }, "attr2": {...} }
ALTER TABLE products ADD COLUMN IF NOT EXISTS technical_specs jsonb DEFAULT '{}'::jsonb;

-- 3. Adicionar produtos relacionados como array de UUIDs (até 6)
ALTER TABLE products ADD COLUMN IF NOT EXISTS related_product_ids uuid[] DEFAULT '{}'::uuid[];

-- 4. Adicionar subcategoria/categoria secundária
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES marketplace_product_categories(id) ON DELETE SET NULL;

-- 5. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_marketplace_category ON products(marketplace_category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);

-- Verificar que allow_sell_without_stock já existe
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_sell_without_stock boolean DEFAULT false;
