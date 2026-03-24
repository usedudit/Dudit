-- Add Mercado Pago integration fields to partners table
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_user_id TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_access_token_encrypted TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_refresh_token_encrypted TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_public_key TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_connected_at TIMESTAMP WITH TIME ZONE;

-- Add Mercado Pago payment ID to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_merchant_order_id TEXT;

-- Create index for faster payment lookups
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON orders(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_partners_mp_user_id ON partners(mp_user_id);

-- Add constraint to ensure MP payment ID is unique
ALTER TABLE orders ADD CONSTRAINT unique_mp_payment_id UNIQUE (mp_payment_id);
