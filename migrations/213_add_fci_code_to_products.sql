-- Add fci_code field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS fci_code VARCHAR(36);

-- Add comment explaining the field
COMMENT ON COLUMN products.fci_code IS 'Código FCI (Ficha de Conteúdo de Importação) - UUID format for products with foreign content origins 3, 5, or 8';
