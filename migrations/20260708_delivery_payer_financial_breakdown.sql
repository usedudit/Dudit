-- Add delivery_payer to delivery_settings to track who bears the delivery cost
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS delivery_payer text NOT NULL DEFAULT 'customer'
  CHECK (delivery_payer IN ('customer', 'seller'));

COMMENT ON COLUMN public.delivery_settings.delivery_payer IS
  'Indicates who pays for delivery: "customer" (repassado) or "seller" (subsídio, não repassa).';

-- Snapshot: cost per item at order time (for COGS calculation in financial breakdown)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_items.unit_cost IS
  'Snapshot of the product/service cost price at order creation time.';

-- Snapshot: who pays delivery at order time
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_payer TEXT NOT NULL DEFAULT 'customer'
  CHECK (delivery_payer IN ('customer', 'seller'));

COMMENT ON COLUMN public.orders.delivery_payer IS
  'Snapshot of delivery_payer setting at order time: "customer" (repasse) or "seller" (subsídio).';

-- Snapshot: seller commission calculated at order time
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.seller_commission_amount IS
  'Snapshot of the calculated seller commission at order time. 0 = no commission or pre-snapshot order.';
