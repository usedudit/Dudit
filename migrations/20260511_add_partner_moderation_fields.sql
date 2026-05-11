-- Adicionar campos de moderação para parceiros (Logo e Banner)
ALTER TABLE partners ADD COLUMN IF NOT EXISTS logo_moderation_status text DEFAULT 'approved';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS banner_moderation_status text DEFAULT 'approved';

-- Índices para fila de moderação
CREATE INDEX IF NOT EXISTS idx_partners_logo_moderation ON partners(logo_moderation_status) WHERE logo_moderation_status = 'pending_moderation';
CREATE INDEX IF NOT EXISTS idx_partners_banner_moderation ON partners(banner_moderation_status) WHERE banner_moderation_status = 'pending_moderation';
