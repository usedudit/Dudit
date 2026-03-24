-- Add more Mercado Pago payment details to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_status_detail TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_type_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_method_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_date_approved TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_date_created TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_transaction_amount DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_currency_id TEXT;

-- Create indexes for filtering by payment status
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_status ON orders(mp_payment_status);
