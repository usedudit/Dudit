-- ============================================================================
-- Fase 12: WhatsApp → Store-level com fallback Partner
-- ============================================================================
-- Adiciona suporte a múltiplas conexões WhatsApp por Partner (uma por Store).
-- Padrão: store-level > partner-level (store_id IS NULL).
-- Retrocompatível: store_id = NULL mantém comportamento atual.
-- ============================================================================

BEGIN;

-- 1. partner_whatsapp_connections: store_id
ALTER TABLE partner_whatsapp_connections
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pwc_store_id
  ON partner_whatsapp_connections(store_id);

-- 2. Unique index: permite uma conexão ativa por (partner, provider, store)
DROP INDEX IF EXISTS idx_partner_whatsapp_active_provider;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pwc_active_provider_per_store
  ON partner_whatsapp_connections(partner_id, provider, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'))
  WHERE is_active = true;

-- 3. whatsapp_messages: store_id para persistir contexto e evitar re-resolução
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wm_store_id
  ON whatsapp_messages(store_id);

-- 4. RLS: partner_whatsapp_connections
DROP POLICY IF EXISTS partner_whatsapp_connections_partner ON partner_whatsapp_connections;
CREATE POLICY partner_whatsapp_connections_select ON partner_whatsapp_connections
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );
CREATE POLICY partner_whatsapp_connections_insert ON partner_whatsapp_connections
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );
CREATE POLICY partner_whatsapp_connections_update ON partner_whatsapp_connections
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );
CREATE POLICY partner_whatsapp_connections_delete ON partner_whatsapp_connections
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

-- 5. RLS: whatsapp_messages (store-aware)
DROP POLICY IF EXISTS whatsapp_messages_partner ON whatsapp_messages;
CREATE POLICY whatsapp_messages_partner ON whatsapp_messages
  FOR ALL USING (
    partner_id IN (SELECT public.get_user_partner_ids())
    AND (store_id IS NULL OR public.user_has_store_access(store_id))
  );

COMMIT;
