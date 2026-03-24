-- ADICIONAR ÍNDICES PARA PERFORMANCE (N+1 queries)
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_partner_id ON cart_items(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(mp_payment_status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_partner_id ON stock_movements(partner_id);
CREATE INDEX IF NOT EXISTS idx_products_partner_id ON products(partner_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_partner_id ON payment_methods(partner_id);
CREATE INDEX IF NOT EXISTS idx_customers_partner_id ON customers(partner_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_partner_id ON suppliers(partner_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_order_id ON accounts_receivable(order_id);

-- FORÇAR RLS EM TABELAS CRÍTICAS
ALTER TABLE partners FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;

-- ADICIONAR RLS POLICY PARA public_user_profiles (estava sem RLS)
-- public_user_profiles is actually unused and will be dropped

-- DROP VIEW IF EXISTS public_user_profiles CASCADE;

-- PROTEGER TOKENS DO MP - CRIAR VIEWS QUE NÃO EXPÕEM TOKENS
DROP VIEW IF EXISTS partners_public CASCADE;
CREATE VIEW partners_public AS
SELECT 
  id,
  user_id,
  store_name,
  store_description,
  address,
  zip_code,
  city,
  state,
  opening_hours,
  rating,
  is_active,
  sells_products,
  provides_services,
  rents_items,
  has_reservable_spaces,
  store_image_url,
  created_at
FROM partners
WHERE is_active = true;

-- VIEW SEGURA PARA CHECKOUT
DROP VIEW IF EXISTS partners_checkout CASCADE;
CREATE VIEW partners_checkout AS
SELECT 
  id,
  user_id,
  store_name,
  address,
  mp_public_key,
  max_installments,
  installments_without_interest,
  interest_rate_percent
FROM partners
WHERE is_active = true;

-- CRIAR VIEW SEGURA PARA ORDERS (sem dados sensíveis)
DROP VIEW IF EXISTS orders_public CASCADE;
CREATE VIEW orders_public AS
SELECT 
  o.id,
  o.order_number,
  o.buyer_id,
  o.partner_id,
  o.quantity,
  o.total_amount,
  o.created_at,
  o.updated_at,
  o.situation,
  o.delivery_type,
  o.delivery_address,
  o.mp_payment_status,
  o.mp_payment_type_id,
  o.customer_name,
  o.payment_method
FROM orders o;

-- ADICIONAR COLUNA PARA AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL,
  user_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS PARA AUDIT LOGS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs"
ON audit_logs FOR SELECT
USING (auth.jwt() ->> 'role' = 'admin');

-- CRIAR TABELA PARA RATE LIMITING
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  user_id uuid,
  request_count integer DEFAULT 1,
  reset_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint ON rate_limit_logs(ip_address, endpoint, reset_at);

-- CRIAR TABELA PARA DETECTAR ATIVIDADES SUSPEITAS
CREATE TABLE IF NOT EXISTS suspicious_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  activity_type text NOT NULL,
  severity text DEFAULT 'low',
  details jsonb,
  ip_address text,
  user_agent text,
  resolved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;

-- ADICIONAR POLÍTICA PARA MASCARAR CPF/CNPJ EM SELECTS PÚBLICOS
-- CRIAR FUNÇÃO PARA MASCARAR DADOS SENSÍVEIS
CREATE OR REPLACE FUNCTION mask_document(document text)
RETURNS text AS $$
BEGIN
  IF document IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN substring(document, 1, 3) || '***' || substring(document, length(document) - 2, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- VIEW PARA CUSTOMERS COM CPFS MASCARADOS
DROP VIEW IF EXISTS customers_safe CASCADE;
CREATE VIEW customers_safe AS
SELECT 
  id,
  partner_id,
  name,
  email,
  phone,
  person_type,
  mask_document(cpf) as cpf,
  mask_document(cnpj) as cnpj,
  address,
  city,
  state,
  country,
  zip_code,
  created_at,
  updated_at
FROM customers;

-- ADICIONAR CONSTRAINT PARA VALIDAR STATUS DE PAGAMENTO
ALTER TABLE orders ADD CONSTRAINT valid_payment_status
CHECK (mp_payment_status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'disputed'));

-- CRIAR FUNÇÃO PARA VALIDAR E SANITIZAR INPUTS
CREATE OR REPLACE FUNCTION sanitize_text(input text, max_length integer DEFAULT 500)
RETURNS text AS $$
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN trim(substring(input, 1, max_length));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- DROP UNUSED VIEW
DROP VIEW IF EXISTS public_user_profiles CASCADE;
