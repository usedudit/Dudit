-- Allows a partner to receive the remaining deposit balance in person
-- (ERP/manual) after the online deposit has been paid.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS deposit_balance_manual_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.partners.deposit_balance_manual_enabled IS
  'When true, staff can register the remaining deposit balance manually (cash/card/Pix/split) after the online deposit is paid.';
