-- Remove overload antiga de create_return_request (12 parâmetros) que conflita
-- com a versão mais recente de 14 parâmetros (com SLA, elegibilidade, policy).
--
-- Causa raiz:
--   Migration 20260522 criou: create_return_request(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TIMESTAMPTZ, TEXT)
--   Migration 20260622 recriou via CREATE OR REPLACE adicionando 2 parâmetros (p_origin_request_id, p_origin_type)
--   → Como o número de parâmetros mudou, o PostgreSQL manteve AMBAS as overloads
--   → Chamadas com 12 parâmetros ficam ambíguas → erro "Could not choose the best candidate function"
--
-- Solução: dropar a overload antiga. A versão de 14 parâmetros já tem defaults (DEFAULT NULL)
-- para os parâmetros extras, então chamadas com 12 parâmetros funcionarão perfeitamente.

DROP FUNCTION IF EXISTS public.create_return_request(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_source TEXT,
  p_resolution TEXT,
  p_reason TEXT,
  p_message TEXT,
  p_items JSONB,
  p_evidence JSONB,
  p_idempotency_key TEXT,
  p_expires_at TIMESTAMPTZ,
  p_request_type TEXT
);
