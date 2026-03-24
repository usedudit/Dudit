-- Script para melhorar segurança do 2FA hasheando backup codes

-- Adicionar coluna para armazenar hash dos backup codes ao invés de plain text
ALTER TABLE user_2fa_backup_codes ADD COLUMN IF NOT EXISTS code_hash TEXT;

-- Migrar códigos existentes para hash (em produção, isso deve ser feito com cuidado)
-- NOTA: Códigos existentes em plain text não podem ser hasheados retroativamente
-- Usuários precisarão regenerar seus códigos

-- Criar índice para melhorar performance de verificação
CREATE INDEX IF NOT EXISTS idx_user_2fa_backup_codes_user_id_used ON user_2fa_backup_codes(user_id, used);

-- Adicionar trigger para garantir que códigos sejam sempre hasheados
CREATE OR REPLACE FUNCTION hash_backup_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Se code_hash está vazio mas code não está, hash o code
  IF NEW.code_hash IS NULL AND NEW.code IS NOT NULL THEN
    NEW.code_hash := encode(digest(NEW.code, 'sha256'), 'hex');
    NEW.code := NULL; -- Limpar plain text após hash
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hash_backup_code_trigger
  BEFORE INSERT OR UPDATE ON user_2fa_backup_codes
  FOR EACH ROW
  EXECUTE FUNCTION hash_backup_code();

-- Adicionar rate limiting para tentativas de 2FA
CREATE TABLE IF NOT EXISTS user_2fa_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL, -- 'totp' ou 'backup_code'
  success BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_2fa_attempts_user_id_time ON user_2fa_attempts(user_id, attempted_at DESC);

-- Limpar tentativas antigas (> 1 hora)
CREATE OR REPLACE FUNCTION cleanup_old_2fa_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM user_2fa_attempts WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- RLS para tabelas de 2FA
ALTER TABLE user_2fa_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own 2FA attempts" ON user_2fa_attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert 2FA attempts" ON user_2fa_attempts
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE user_2fa_attempts IS 'Tracks 2FA authentication attempts for rate limiting and security monitoring';
COMMENT ON TABLE user_2fa_backup_codes IS 'Stores hashed backup codes for 2FA recovery';
