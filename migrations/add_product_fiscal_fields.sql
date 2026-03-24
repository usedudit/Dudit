-- Adiciona campos fiscais extras na tabela de produtos
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS c_benef text DEFAULT NULL,      -- Código de Benefício Fiscal (ex: PR80000)
ADD COLUMN IF NOT EXISTS inf_ad_prod text DEFAULT NULL,  -- Informações Adicionais (ex: "Validade: 12/2025")
ADD COLUMN IF NOT EXISTS weight_gross numeric DEFAULT 0, -- Peso Bruto (kg) - Para o SuperFrete
ADD COLUMN IF NOT EXISTS weight_net numeric DEFAULT 0,   -- Peso Líquido (kg)
ADD COLUMN IF NOT EXISTS width numeric DEFAULT 0,        -- Largura (cm)
ADD COLUMN IF NOT EXISTS height numeric DEFAULT 0,       -- Altura (cm)
ADD COLUMN IF NOT EXISTS length numeric DEFAULT 0;       -- Comprimento (cm)
