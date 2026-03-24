-- LIMPEZA (Apaga o que fizemos antes pra não duplicar)
TRUNCATE marketplace_product_categories CASCADE;
TRUNCATE marketplace_service_categories CASCADE;

-- ============================================================
-- PRODUTOS (4 PRINCIPAIS + OUTROS)
-- ============================================================
DO $$
DECLARE
  cat_tech uuid;
  cat_style uuid;
  cat_home uuid;
  cat_auto uuid;
BEGIN
  -- 1. Tecnologia
  INSERT INTO marketplace_product_categories (name, icon_url) VALUES ('Tecnologia', 'smartphone') RETURNING id INTO cat_tech;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Celulares e Acessórios', cat_tech);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Computadores e Informática', cat_tech);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('TV e Áudio', cat_tech);

  -- 2. Moda e Beleza
  INSERT INTO marketplace_product_categories (name, icon_url) VALUES ('Moda e Beleza', 'shirt') RETURNING id INTO cat_style;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Roupas e Calçados', cat_style);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Bolsas e Acessórios', cat_style);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Beleza e Cuidados Pessoais', cat_style);

  -- 3. Casa e Lazer
  INSERT INTO marketplace_product_categories (name, icon_url) VALUES ('Casa e Lazer', 'home') RETURNING id INTO cat_home;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Móveis e Decoração', cat_home);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Eletrodomésticos', cat_home);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Esportes e Camping', cat_home);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Ferramentas e Construção', cat_home);

  -- 4. Veículos e Peças
  INSERT INTO marketplace_product_categories (name, icon_url) VALUES ('Veículos e Peças', 'car') RETURNING id INTO cat_auto;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Peças e Acessórios', cat_auto);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Som e Vídeo Automotivo', cat_auto);

  -- 5. Outros (A Rede de Segurança)
  INSERT INTO marketplace_product_categories (name, icon_url) VALUES ('Outros', 'grid');
    -- Não precisa de subcategorias aqui, ou pode por um genérico:
    -- INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('Diversos', (SELECT id FROM marketplace_product_categories WHERE name = 'Outros'));
END $$;

-- ============================================================
-- SERVIÇOS (4 PRINCIPAIS + OUTROS)
-- ============================================================
DO $$
DECLARE
  serv_reforma uuid;
  serv_tec uuid;
  serv_beauty uuid;
  serv_pro uuid;
BEGIN
  -- 1. Reformas e Manutenção
  INSERT INTO marketplace_service_categories (name, icon_url) VALUES ('Reformas e Manutenção', 'hammer') RETURNING id INTO serv_reforma;
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Eletricista e Encanador', serv_reforma);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Montagem e Instalação', serv_reforma);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Pintura e Obras', serv_reforma);

  -- 2. Assistência Técnica
  INSERT INTO marketplace_service_categories (name, icon_url) VALUES ('Assistência Técnica', 'wrench') RETURNING id INTO serv_tec;
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Celulares e Tablets', serv_tec);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Computadores e Informática', serv_tec);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Eletrodomésticos', serv_tec);

  -- 3. Beleza e Estética
  INSERT INTO marketplace_service_categories (name, icon_url) VALUES ('Beleza e Estética', 'scissors') RETURNING id INTO serv_beauty;
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Cabelo e Barba', serv_beauty);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Manicure e Pedicure', serv_beauty);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Estética Corporal', serv_beauty);

  -- 4. Fretes e Profissionais
  INSERT INTO marketplace_service_categories (name, icon_url) VALUES ('Fretes e Profissionais', 'briefcase') RETURNING id INTO serv_pro;
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Fretes e Mudanças', serv_pro);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Design e Tecnologia', serv_pro);
    INSERT INTO marketplace_service_categories (name, parent_id) VALUES ('Aulas e Consultoria', serv_pro);

  -- 5. Outros Serviços
  INSERT INTO marketplace_service_categories (name, icon_url) VALUES ('Outros Serviços', 'grid');
END $$;