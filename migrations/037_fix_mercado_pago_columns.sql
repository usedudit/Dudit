-- Fix Mercado Pago integration columns - ensure correct column names with _encrypted suffix
-- First, ensure all MP columns exist with correct names
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_user_id TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_access_token_encrypted TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_refresh_token_encrypted TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_public_key TEXT;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS mp_connected_at TIMESTAMP WITH TIME ZONE;

-- Create indices if they don't exist
CREATE INDEX IF NOT EXISTS idx_partners_mp_user_id ON partners(mp_user_id);
