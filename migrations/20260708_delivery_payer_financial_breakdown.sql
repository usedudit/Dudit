-- Add delivery_payer to delivery_settings to track who bears the delivery cost
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS delivery_payer text NOT NULL DEFAULT 'customer'
  CHECK (delivery_payer IN ('customer', 'seller'));

COMMENT ON COLUMN public.delivery_settings.delivery_payer IS
  'Indicates who pays for delivery: "customer" (repassado) or "seller" (subsídio, não repassa).';
