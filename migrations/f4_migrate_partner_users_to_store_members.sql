-- ============================================================================
-- Fase 4 - Migrar partner_users existentes para store_members
-- ============================================================================
-- Para cada partner_user que NÃO é OWNER, criar store_member vinculado
-- à Loja Principal do Partner. OWNERs não precisam de store_member
-- (têm bypass automático via RLS e application logic).
--
-- Idempotente: só insere se ainda não existir store_member para o par.
-- ============================================================================

BEGIN;

INSERT INTO store_members (partner_user_id, store_id, role, permissions)
SELECT
  pu.id,
  s.id,
  pu.role,
  pu.permissions
FROM partner_users pu
JOIN stores s ON s.partner_id = pu.partner_id AND s.is_headquarters = true
WHERE (pu.role IS NULL OR pu.role != 'OWNER')
  AND NOT EXISTS (
    SELECT 1 FROM store_members sm
    WHERE sm.partner_user_id = pu.id AND sm.store_id = s.id
  );

COMMIT;
