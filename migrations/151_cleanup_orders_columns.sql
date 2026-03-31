ALTER TABLE orders DROP COLUMN IF EXISTS quantity CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS internal_notes CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_merchant_order_id CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_payment_status_detail CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_payment_type_id CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_payment_method_id CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_date_approved CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_date_created CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_transaction_amount CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_currency_id CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_preference_id CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS mp_payment_status CASCADE;

-- Recreate orders_public without dropped columns
DROP VIEW IF EXISTS orders_public CASCADE;
CREATE VIEW orders_public AS
SELECT 
  o.id,
  o.order_number,
  o.buyer_id,
  o.partner_id,
  o.total_amount,
  o.created_at,
  o.updated_at,
  o.situation,
  o.delivery_type,
  o.delivery_address,
  o.customer_name,
  o.payment_method
FROM orders o;
