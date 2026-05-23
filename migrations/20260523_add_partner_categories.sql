-- Create table for partner categories and subcategories
CREATE TABLE IF NOT EXISTS marketplace_partner_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    parent_id uuid REFERENCES marketplace_partner_categories(id) ON DELETE CASCADE,
    icon_url text,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS and create public read policy
ALTER TABLE marketplace_partner_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access for partner categories" ON marketplace_partner_categories;
CREATE POLICY "Allow public read access for partner categories" ON marketplace_partner_categories
    FOR SELECT TO public USING (true);

-- Add category columns to partners table
ALTER TABLE partners ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES marketplace_partner_categories(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES marketplace_partner_categories(id) ON DELETE SET NULL;

-- Create indexes on partners table for category queries
CREATE INDEX IF NOT EXISTS idx_partners_category_id ON partners(category_id);
CREATE INDEX IF NOT EXISTS idx_partners_subcategory_id ON partners(subcategory_id);

-- Seed Categories and Subcategories
DO $$
DECLARE
    cat_alimentacao uuid;
    cat_mercado uuid;
    cat_casa uuid;
    cat_servicos uuid;
    cat_automotivo uuid;
    cat_beleza uuid;
    cat_moda uuid;
    cat_tecnologia uuid;
    cat_saude uuid;
    cat_outros uuid;
BEGIN
    -- Truncate existing data to avoid duplication/conflicts
    TRUNCATE marketplace_partner_categories CASCADE;

    -- 1. Alimentação
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Alimentação', 'alimentacao', 'utensils') RETURNING id INTO cat_alimentacao;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Restaurante', 'restaurante', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Lanchonete', 'lanchonete', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Pizzaria', 'pizzaria', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Hamburgueria', 'hamburgueria', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Padaria', 'padaria', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Confeitaria', 'confeitaria', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Marmitas', 'marmitas', cat_alimentacao);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Açougue', 'acougue', cat_alimentacao);

    -- 2. Mercado & Conveniência
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Mercado & Conveniência', 'mercado-e-conveniencia', 'shopping-cart') RETURNING id INTO cat_mercado;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Supermercado', 'supermercado', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Mercado', 'mercado', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Mercearia', 'mercearia', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Farmácia', 'farmacia', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Pet shop', 'pet-shop', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Loja de conveniência', 'loja-de-conveniencia', cat_mercado);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Água e gás', 'agua-e-gas', cat_mercado);

    -- 3. Casa & Construção
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Casa & Construção', 'casa-e-construcao', 'home') RETURNING id INTO cat_casa;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Material de construção', 'material-de-construcao', cat_casa);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Vidraçaria', 'vidracaria', cat_casa);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Marcenaria', 'marcenaria', cat_casa);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Marmoraria', 'marmoraria', cat_casa);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Elétrica', 'eletrica', cat_casa);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Hidráulica', 'hidraulica', cat_casa);

    -- 4. Serviços residenciais
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Serviços residenciais', 'servicos-residenciais', 'wrench') RETURNING id INTO cat_servicos;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Encanador', 'encanador', cat_servicos);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Eletricista', 'eletricista', cat_servicos);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Pintor', 'pintor', cat_servicos);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Chaveiro', 'chaveiro', cat_servicos);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Jardineiro', 'jardineiro', cat_servicos);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Limpeza', 'limpeza', cat_servicos);

    -- 5. Automotivo
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Automotivo', 'automotivo', 'car') RETURNING id INTO cat_automotivo;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Oficina mecânica', 'oficina-mecanica', cat_automotivo);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Autopeças', 'autopecas', cat_automotivo);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Lava-rápido', 'lava-rapido', cat_automotivo);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Borracharia', 'borracharia', cat_automotivo);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Guincho', 'guincho', cat_automotivo);

    -- 6. Beleza & Bem-estar
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Beleza & Bem-estar', 'beleza-e-bem-estar', 'scissors') RETURNING id INTO cat_beleza;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Salão de beleza', 'salao-de-beleza', cat_beleza);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Barbearia', 'barbearia', cat_beleza);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Manicure', 'manicure', cat_beleza);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Estética', 'estetica', cat_beleza);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Massagem', 'massagem', cat_beleza);

    -- 7. Moda & Acessórios
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Moda & Acessórios', 'moda-e-acessorios', 'shirt') RETURNING id INTO cat_moda;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Loja de roupas', 'loja-de-roupas', cat_moda);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Calçados', 'calcados', cat_moda);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Acessórios', 'acessorios', cat_moda);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Joias/Bijuterias', 'joias-bijuterias', cat_moda);

    -- 8. Tecnologia
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Tecnologia', 'tecnologia', 'smartphone') RETURNING id INTO cat_tecnologia;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Assistência técnica', 'assistencia-tecnica', cat_tecnologia);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Informática', 'informatica', cat_tecnologia);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Celulares', 'celulares', cat_tecnologia);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Eletrônicos', 'eletronicos', cat_tecnologia);

    -- 9. Saúde
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Saúde', 'saude', 'activity') RETURNING id INTO cat_saude;
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Clínica', 'clinica', cat_saude);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Dentista', 'dentista', cat_saude);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Psicologia', 'psicologia', cat_saude);
        INSERT INTO marketplace_partner_categories (name, slug, parent_id) VALUES ('Fisioterapia', 'fisioterapia', cat_saude);

    -- 10. Outros
    INSERT INTO marketplace_partner_categories (name, slug, icon_url) 
    VALUES ('Outros', 'outros', 'grid') RETURNING id INTO cat_outros;

END $$;
