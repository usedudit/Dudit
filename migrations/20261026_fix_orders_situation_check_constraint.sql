-- Fix: Update orders_situation_check constraint to include all valid order situations
-- This prevents check constraint violations (23514) when payments fail (payment_failed),
-- are in review (in_process), partially paid (partially_paid), refunded, etc.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_situation_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_situation_check CHECK (
  situation IN (
    'pending',
    'paid',
    'cancelled',
    'partially_paid',
    'shipped',
    'delivered',
    'completed',
    'in_process',
    'payment_failed',
    'refunded',
    'approved',
    'unpaid',
    'awaiting_payment',
    'not_paid',
    'processing',
    'awaiting_pickup_payment'
  )
);
