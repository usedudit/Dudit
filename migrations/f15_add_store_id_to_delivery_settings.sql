-- ============================================================================
-- Fase 15: Delivery Settings → Store-level
-- ============================================================================
-- Objetivo: Permitir que cada loja tenha sua própria configuração de entrega,
-- com fallback para o padrão do partner (store_id IS NULL).
--
-- Regras:
--   store_id preenchido → override da loja
--   store_id NULL       → padrão do partner
--   Cada partner tem NO MÁXIMO 1 registro padrão (store_id IS NULL)
--   Cada par (partner, store) tem NO MÁXIMO 1 registro
--
-- Mudanças estruturais:
--   1. Coluna store_id + índice
--   2. Chave primária migrada de partner_id → id (surrogate UUID)
--   3. Unique constraints parciais para garantir integridade
--   4. RLS substituída (FOR ALL → 4 policies individuais store-aware)
-- ============================================================================
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS
-- ============================================================================

BEGIN;

-- ─── 1. Coluna store_id ──────────────────────────────────────────────────────

ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_settings_store_id
  ON public.delivery_settings(store_id);

-- ─── 2. Chave primária: partner_id → id (surrogate UUID) ───────────────────
-- Permite múltiplos registros por partner (1 default + N overrides de loja)

ALTER TABLE public.delivery_settings ADD COLUMN IF NOT EXISTS id UUID;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.delivery_settings WHERE id IS NULL LIMIT 1) THEN
    UPDATE public.delivery_settings SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.delivery_settings ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.delivery_settings DROP CONSTRAINT IF EXISTS delivery_settings_pkey;
    ALTER TABLE public.delivery_settings ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ─── 3. Unique constraints parciais (evita duplicatas) ─────────────────────

-- Máximo 1 registro padrão por partner
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_settings_partner_default
  ON public.delivery_settings(partner_id) WHERE store_id IS NULL;

-- Máximo 1 override por par (partner, store)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_settings_partner_store
  ON public.delivery_settings(partner_id, store_id) WHERE store_id IS NOT NULL;

-- ─── 4. RLS: substituir FOR ALL por 4 policies individuais ─────────────────

-- 4a. SELECT
DROP POLICY IF EXISTS delivery_settings_partner_rw ON public.delivery_settings;
DROP POLICY IF EXISTS delivery_settings_select ON public.delivery_settings;
CREATE POLICY delivery_settings_select ON public.delivery_settings
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 4b. INSERT
DROP POLICY IF EXISTS delivery_settings_insert ON public.delivery_settings;
CREATE POLICY delivery_settings_insert ON public.delivery_settings
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 4c. UPDATE
DROP POLICY IF EXISTS delivery_settings_update ON public.delivery_settings;
CREATE POLICY delivery_settings_update ON public.delivery_settings
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 4d. DELETE
DROP POLICY IF EXISTS delivery_settings_delete ON public.delivery_settings;
CREATE POLICY delivery_settings_delete ON public.delivery_settings
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

COMMIT;
