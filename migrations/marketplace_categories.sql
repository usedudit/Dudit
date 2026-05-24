-- LIMPEZA (Apaga o que fizemos antes pra não duplicar)
TRUNCATE marketplace_product_categories CASCADE;
TRUNCATE marketplace_service_categories CASCADE;

-- ============================================================
-- PRODUTOS (9 CATEGORIAS PRINCIPAIS)
-- ============================================================
DO $$
DECLARE
  cat_casa_utilidades uuid;
  cat_moda_beleza uuid;
  cat_saude_bem_estar uuid;
  cat_tecnologia_eletronicos uuid;
  cat_auto_moto uuid;
  cat_pets uuid;
  cat_construcao_ferramentas uuid;
  cat_agro_jardim uuid;
  cat_infantil_brinquedos uuid;
BEGIN
  -- 1. Casa & Utilidades
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Casa & Utilidades', 'https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png') 
  RETURNING id INTO cat_casa_utilidades;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('mercado', cat_casa_utilidades);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('utensílios', cat_casa_utilidades);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('variedades', cat_casa_utilidades);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('construção leve', cat_casa_utilidades);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('decoração', cat_casa_utilidades);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('limpeza', cat_casa_utilidades);

  -- 2. Moda & Beleza
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Moda & Beleza', 'https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png') 
  RETURNING id INTO cat_moda_beleza;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('roupas', cat_moda_beleza);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('acessórios', cat_moda_beleza);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('cosméticos', cat_moda_beleza);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('salão', cat_moda_beleza);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('maquiagem', cat_moda_beleza);

  -- 3. Saúde & Bem-estar
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Saúde & Bem-estar', 'https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png') 
  RETURNING id INTO cat_saude_bem_estar;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('farmácia', cat_saude_bem_estar);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('suplementos', cat_saude_bem_estar);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('ótica', cat_saude_bem_estar);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('produtos médicos', cat_saude_bem_estar);

  -- 4. Tecnologia & Eletrônicos
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Tecnologia & Eletrônicos', 'https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png') 
  RETURNING id INTO cat_tecnologia_eletronicos;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('celular', cat_tecnologia_eletronicos);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('informática', cat_tecnologia_eletronicos);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('acessórios', cat_tecnologia_eletronicos);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('games', cat_tecnologia_eletronicos);

  -- 5. Auto & Moto
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Auto & Moto', 'https://img.dudit.com.br/static/categories/products/Auto-e-moto.png') 
  RETURNING id INTO cat_auto_moto;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('peças', cat_auto_moto);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('acessórios', cat_auto_moto);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('pneus', cat_auto_moto);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('oficina leve', cat_auto_moto);

  -- 6. Pets
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Pets', 'https://img.dudit.com.br/static/categories/products/Pets.png') 
  RETURNING id INTO cat_pets;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('ração', cat_pets);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('banho/tosa', cat_pets);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('acessórios', cat_pets);

  -- 7. Construção & Ferramentas
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Construção & Ferramentas', 'https://img.dudit.com.br/static/categories/products/Construcao-e-ferramentas.png') 
  RETURNING id INTO cat_construcao_ferramentas;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('material', cat_construcao_ferramentas);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('elétrica', cat_construcao_ferramentas);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('hidráulica', cat_construcao_ferramentas);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('ferramentas', cat_construcao_ferramentas);

  -- 8. Agro & Jardim
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Agro & Jardim', 'https://img.dudit.com.br/static/categories/products/Agro-e-jardim.png') 
  RETURNING id INTO cat_agro_jardim;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('ração animal', cat_agro_jardim);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('ferramentas', cat_agro_jardim);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('plantas', cat_agro_jardim);

  -- 9. Infantil & Brinquedos
  INSERT INTO marketplace_product_categories (name, icon_url) 
  VALUES ('Infantil & Brinquedos', 'https://img.dudit.com.br/static/categories/products/Infantil-e-brinquedos.png') 
  RETURNING id INTO cat_infantil_brinquedos;
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('bebê', cat_infantil_brinquedos);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('brinquedos', cat_infantil_brinquedos);
    INSERT INTO marketplace_product_categories (name, parent_id) VALUES ('escolar', cat_infantil_brinquedos);

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