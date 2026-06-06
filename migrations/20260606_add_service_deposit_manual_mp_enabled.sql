-- Add columns for manual and Mercado Pago service deposit (sinal) to partners table
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS service_deposit_manual_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_deposit_mp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate existing active deposit configurations:
UPDATE public.partners
SET service_deposit_manual_enabled = TRUE
WHERE service_deposit_enabled = TRUE;

COMMENT ON COLUMN public.partners.service_deposit_manual_enabled IS 'Whether manual Pix signal is allowed for bookings';
COMMENT ON COLUMN public.partners.service_deposit_mp_enabled IS 'Whether online Mercado Pago signal is allowed for bookings';
