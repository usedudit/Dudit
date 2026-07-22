-- Replace is_active boolean with status text on products and services
-- Values: 'ativo', 'inativo', 'arquivado', 'excluido'
-- IMPORTANT: Run this migration AFTER code has been deployed to handle status text column!

ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE services ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo';

UPDATE products SET status = CASE WHEN is_active THEN 'ativo' ELSE 'inativo' END;
UPDATE services SET status = CASE WHEN is_active THEN 'ativo' ELSE 'inativo' END;

-- Drop original boolean is_active and recreate as generated column for backward compat
ALTER TABLE products DROP COLUMN is_active;
ALTER TABLE services DROP COLUMN is_active;

ALTER TABLE products ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'ativo') STORED;
ALTER TABLE services ADD COLUMN is_active BOOLEAN GENERATED ALWAYS AS (status = 'ativo') STORED;

-- Indexes for faster filtering
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
