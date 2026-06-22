-- Migration: 1000_add_customer_id_to_orders
-- Description: Adiciona coluna customer_id em orders para desambiguar
-- o polimorfismo de buyer_id (auth user vs customers.id)
--
-- UP
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner_customer ON orders(partner_id, customer_id);

-- DOWN (reversível)
-- DROP INDEX IF EXISTS idx_orders_partner_customer;
-- DROP INDEX IF EXISTS idx_orders_customer_id;
-- ALTER TABLE orders DROP COLUMN IF EXISTS customer_id;
