-- Drop the constraint that limits card_brand to a single value
ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_card_brand_check;

-- Add comment explaining the change
COMMENT ON COLUMN public.payment_methods.card_brand IS 'Semicolon-separated list of card brands (e.g., "visa; mastercard;")';
