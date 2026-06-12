-- Add payment expiration columns to orders table
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stock_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method_at_pickup TEXT;

COMMENT ON COLUMN orders.payment_expires_at IS 'When the payment for this order expires. After this timestamp, the order is auto-cancelled and inventory is released.';
COMMENT ON COLUMN orders.cancelled_at IS 'When the order was cancelled (manually or by expiration).';
COMMENT ON COLUMN orders.stock_released_at IS 'When reserved inventory was released back (due to cancellation/expiration).';
COMMENT ON COLUMN orders.paid_at IS 'When the order was marked as paid.';
COMMENT ON COLUMN orders.payment_method_at_pickup IS 'Payment method used by the customer at pickup (cash, pix, card, other).';
