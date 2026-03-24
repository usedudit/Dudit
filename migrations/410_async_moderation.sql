-- Migration: Async moderation for products (production-grade)
-- Moderação assíncrona com retry, backoff, locking atômico
--
-- EXECUTAR no Supabase SQL Editor antes do deploy

-- ============================================================================
-- 1. Coluna moderation_status na tabela products
-- ============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  moderation_status TEXT NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_products_moderation_status 
  ON products(moderation_status);

-- ============================================================================
-- 2. Tabela moderation_jobs (com retry support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS moderation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'product',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice parcial para jobs elegíveis ao cron
CREATE INDEX IF NOT EXISTS idx_moderation_jobs_claimable 
  ON moderation_jobs(created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_moderation_jobs_product 
  ON moderation_jobs(product_id);

-- RLS (apenas service_role acessa)
ALTER TABLE moderation_jobs ENABLE ROW LEVEL SECURITY;

-- Adicionar colunas de retry (para tabelas que já existem de migração anterior)
ALTER TABLE moderation_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE moderation_jobs ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
ALTER TABLE moderation_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;

-- ============================================================================
-- 3. RPC: Atomic job claiming (FOR UPDATE SKIP LOCKED)
--    Garante que apenas UM worker processa cada job.
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_moderation_jobs(p_limit INTEGER DEFAULT 5)
RETURNS SETOF moderation_jobs
LANGUAGE sql
VOLATILE
SECURITY DEFINER
AS $$
  UPDATE moderation_jobs
  SET status = 'processing', updated_at = NOW()
  WHERE id IN (
    SELECT id FROM moderation_jobs
    WHERE (
      -- Jobs pendentes prontos para processar
      (status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
      OR
      -- Jobs stuck em processing há mais de 5 minutos (worker morreu)
      (status = 'processing' AND updated_at < NOW() - interval '5 minutes')
    )
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Drop old partial index if exists (from previous migration)
DROP INDEX IF EXISTS idx_moderation_jobs_pending;
