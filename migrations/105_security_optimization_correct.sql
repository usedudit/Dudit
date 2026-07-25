-- ============================================
-- SCRIPT DE OTIMIZAÇÃO E SEGURANÇA DO BANCO
-- ============================================
-- Este script NÃO tenta habilitar RLS em views
-- Aplica segurança apenas em tabelas reais

-- ============================================
-- PARTE 1: ÍNDICES DE PERFORMANCE
-- ============================================

-- Índices para melhorar queries de RLS e JOINs
CREATE INDEX IF NOT EXISTS idx_products_partner_id ON products(partner_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_situation ON orders(situation);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(mp_payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

CREATE INDEX IF NOT EXISTS idx_customers_partner_id ON customers(partner_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_cnpj ON customers(cnpj) WHERE cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partners_user_id ON partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_id ON payment_methods(partner_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_partner_id ON stock_movements(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_partner_id ON accounts_payable(partner_id, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status, due_date);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_partner_id ON accounts_receivable(partner_id, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON accounts_receivable(status, due_date);

-- ============================================
-- PARTE 2: CONSTRAINTS DE VALIDAÇÃO
-- ============================================

-- Validação de email
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_email_format,
  ADD CONSTRAINT customers_email_format 
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE suppliers 
  DROP CONSTRAINT IF EXISTS suppliers_email_format,
  ADD CONSTRAINT suppliers_email_format 
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Validação de CPF (11 dígitos)
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_cpf_format,
  ADD CONSTRAINT customers_cpf_format 
  CHECK (cpf IS NULL OR cpf ~ '^\d{11}$');

-- Validação de CNPJ (14 caracteres alfanuméricos)
ALTER TABLE customers 
  DROP CONSTRAINT IF EXISTS customers_cnpj_format,
  ADD CONSTRAINT customers_cnpj_format 
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{14}$');

ALTER TABLE suppliers 
  DROP CONSTRAINT IF EXISTS suppliers_cnpj_format,
  ADD CONSTRAINT suppliers_cnpj_format 
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{14}$');

ALTER TABLE partners 
  DROP CONSTRAINT IF EXISTS partners_cnpj_format,
  ADD CONSTRAINT partners_cnpj_format 
  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9A-Z]{14}$');

-- Validação de preços e quantidades (não negativos)
ALTER TABLE products 
  DROP CONSTRAINT IF EXISTS products_price_positive,
  ADD CONSTRAINT products_price_positive CHECK (price >= 0);

ALTER TABLE products 
  DROP CONSTRAINT IF EXISTS products_stock_non_negative,
  ADD CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0);

ALTER TABLE orders 
  DROP CONSTRAINT IF EXISTS orders_quantity_positive,
  ADD CONSTRAINT orders_quantity_positive CHECK (quantity > 0);

ALTER TABLE orders 
  DROP CONSTRAINT IF EXISTS orders_total_positive,
  ADD CONSTRAINT orders_total_positive CHECK (total_amount >= 0);

-- ============================================
-- PARTE 3: FUNÇÃO DE LIMPEZA DE DADOS ÓRFÃOS
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_orphaned_data()
RETURNS TABLE(
  table_name text,
  records_deleted bigint
) AS $$
BEGIN
  -- Limpar cart_items de produtos deletados
  DELETE FROM cart_items 
  WHERE product_id NOT IN (SELECT id FROM products);
  
  RETURN QUERY SELECT 'cart_items (orphaned products)'::text, 
    (SELECT COUNT(*) FROM cart_items WHERE product_id NOT IN (SELECT id FROM products))::bigint;

  -- Limpar order_items de produtos deletados
  DELETE FROM order_items 
  WHERE product_id NOT IN (SELECT id FROM products);
  
  RETURN QUERY SELECT 'order_items (orphaned products)'::text,
    (SELECT COUNT(*) FROM order_items WHERE product_id NOT IN (SELECT id FROM products))::bigint;

  -- Limpar stock_movements de produtos deletados
  DELETE FROM stock_movements 
  WHERE product_id IS NOT NULL 
  AND product_id NOT IN (SELECT id FROM products);
  
  RETURN QUERY SELECT 'stock_movements (orphaned products)'::text,
    (SELECT COUNT(*) FROM stock_movements WHERE product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM products))::bigint;

  -- Limpar accounts_receivable de customers deletados
  UPDATE accounts_receivable 
  SET customer_id = NULL 
  WHERE customer_id IS NOT NULL 
  AND customer_id NOT IN (SELECT id FROM customers);
  
  RETURN QUERY SELECT 'accounts_receivable (orphaned customers)'::text,
    (SELECT COUNT(*) FROM accounts_receivable WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers))::bigint;

  -- Limpar accounts_payable de suppliers deletados
  UPDATE accounts_payable 
  SET supplier_id = NULL 
  WHERE supplier_id IS NOT NULL 
  AND supplier_id NOT IN (SELECT id FROM suppliers);
  
  RETURN QUERY SELECT 'accounts_payable (orphaned suppliers)'::text,
    (SELECT COUNT(*) FROM accounts_payable WHERE supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM suppliers))::bigint;
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PARTE 4: TRIGGERS DE AUDITORIA
-- ============================================

-- Tabela de auditoria (se não existir)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  user_id uuid,
  ip_address text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id, created_at DESC);

-- Função genérica de auditoria
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO audit_logs (table_name, action, old_values, user_id)
    VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), auth.uid());
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO audit_logs (table_name, action, old_values, new_values, user_id)
    VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO audit_logs (table_name, action, new_values, user_id)
    VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar triggers de auditoria em tabelas críticas
DROP TRIGGER IF EXISTS audit_partners ON partners;
CREATE TRIGGER audit_partners
  AFTER INSERT OR UPDATE OR DELETE ON partners
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_products ON products;
CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_payment_methods ON payment_methods;
CREATE TRIGGER audit_payment_methods
  AFTER INSERT OR UPDATE OR DELETE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

DROP TRIGGER IF EXISTS audit_orders ON orders;
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================
-- PARTE 5: VIEWS DE ANÁLISE E MONITORAMENTO
-- ============================================

-- View para monitorar queries lentas
CREATE OR REPLACE VIEW slow_queries_monitor AS
SELECT
  schemaname,
  tablename,
  attname as column_name,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct < 10
ORDER BY tablename, attname;

-- View para analisar uso de storage
CREATE OR REPLACE VIEW storage_usage_analysis AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- View para análise de segurança RLS
CREATE OR REPLACE VIEW rls_security_audit AS
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  (SELECT COUNT(*) 
   FROM pg_policies 
   WHERE schemaname = pg_tables.schemaname 
   AND tablename = pg_tables.tablename) as policies_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================
-- PARTE 6: PERMISSÕES E GRANTS
-- ============================================

-- Garantir que usuários autenticados possam ler views públicas
GRANT SELECT ON partners_public TO authenticated;
GRANT SELECT ON partners_checkout TO authenticated;
GRANT SELECT ON orders_public TO authenticated;
GRANT SELECT ON customers_safe TO authenticated;

-- Permitir usuários anônimos lerem apenas dados públicos necessários
GRANT SELECT ON partners_public TO anon;
GRANT SELECT ON products TO anon;

-- ============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================

COMMENT ON FUNCTION cleanup_orphaned_data() IS 'Limpa dados órfãos de relacionamentos deletados. Execute periodicamente para manter o banco limpo.';
COMMENT ON VIEW rls_security_audit IS 'Mostra o status de RLS e número de policies por tabela para auditoria de segurança.';
COMMENT ON VIEW storage_usage_analysis IS 'Análise de uso de storage por tabela, incluindo tamanho de índices.';
COMMENT ON VIEW slow_queries_monitor IS 'Monitora colunas com baixa cardinalidade que podem precisar de índices.';

-- ============================================
-- MENSAGEM DE CONCLUSÃO
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Script de segurança e otimização executado com sucesso!';
  RAISE NOTICE '📊 Índices criados: ~25 índices para melhorar performance';
  RAISE NOTICE '🔒 Constraints adicionadas: validação de email, CPF, CNPJ, preços';
  RAISE NOTICE '📝 Auditoria ativada: partners, products, payment_methods, orders';
  RAISE NOTICE '🧹 Função de limpeza: cleanup_orphaned_data() disponível';
  RAISE NOTICE '📈 Views de análise: rls_security_audit, storage_usage_analysis, slow_queries_monitor';
  RAISE NOTICE '';
  RAISE NOTICE '💡 Próximos passos:';
  RAISE NOTICE '   1. Execute: SELECT * FROM rls_security_audit; -- para verificar RLS';
  RAISE NOTICE '   2. Execute: SELECT * FROM storage_usage_analysis; -- para ver uso de storage';
  RAISE NOTICE '   3. Execute: SELECT * FROM cleanup_orphaned_data(); -- para limpar dados órfãos';
END $$;
