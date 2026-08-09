-- Add mp_live_mode column to partners table
-- true  = conta Mercado Pago real (credenciais de produção)
-- false = conta de teste (test user) conectada via OAuth
ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS mp_live_mode BOOLEAN;

COMMENT ON COLUMN partners.mp_live_mode IS 'Indicates if the connected Mercado Pago account uses production (live) credentials. false/null means a test account is connected.';
