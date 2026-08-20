-- LIMPEZA (Apaga o que fizemos antes pra não duplicar)
TRUNCATE marketplace_product_categories CASCADE;
TRUNCATE marketplace_service_categories CASCADE;

-- ============================================================
-- PRODUTOS (9 CATEGORIAS PRINCIPAIS — sem subcategorias)
-- ============================================================
INSERT INTO marketplace_product_categories (name, icon_url) VALUES
  ('Alimentação', 'https://img.dudit.com.br/static/categories/products/Alimentacao.png'),
  ('Casa', 'https://img.dudit.com.br/static/categories/products/Casa-e-utilidades.png'),
  ('Tecnologia', 'https://img.dudit.com.br/static/categories/products/Tecnologia-e-eletronicos.png'),
  ('Moda e Beleza', 'https://img.dudit.com.br/static/categories/products/Moda-e-beleza.png'),
  ('Saúde', 'https://img.dudit.com.br/static/categories/products/Saude-e-bem-estar.png'),
  ('Automotivo', 'https://img.dudit.com.br/static/categories/products/Auto-e-moto.png'),
  ('Pets', 'https://img.dudit.com.br/static/categories/products/Pets.png'),
  ('Serviços', ''),
  ('Outros', '');

-- ============================================================
-- SERVIÇOS (4 PRINCIPAIS + OUTROS — sem subcategorias)
-- ============================================================
INSERT INTO marketplace_service_categories (name, icon_url) VALUES
  ('Reformas e Manutenção', 'hammer'),
  ('Assistência Técnica', 'wrench'),
  ('Beleza e Estética', 'scissors'),
  ('Fretes e Profissionais', 'briefcase'),
  ('Outros Serviços', 'grid');