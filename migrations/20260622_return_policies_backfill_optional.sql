-- ============================================================================
-- OPCIONAL - rodar manualmente em produção APÓS revisar o preview.
-- Não faz parte do deploy automático da migration principal.
-- ============================================================================

-- 1) Preview: quantos pedidos seriam afetados?
SELECT COUNT(*) AS orders_to_backfill
FROM public.orders o
WHERE o.return_policy_snapshot IS NULL
  AND LOWER(COALESCE(o.situation, '')) IN ('paid', 'approved', 'partially_paid')
  AND o.created_at > NOW() - INTERVAL '365 days';

-- 2) Amostra (revise 10 linhas antes de rodar o UPDATE em massa):
SELECT
  o.id,
  o.order_number,
  o.partner_id,
  o.situation,
  o.created_at,
  p.store_name
FROM public.orders o
JOIN public.partners p ON p.id = o.partner_id
WHERE o.return_policy_snapshot IS NULL
  AND LOWER(COALESCE(o.situation, '')) IN ('paid', 'approved', 'partially_paid')
  AND o.created_at > NOW() - INTERVAL '365 days'
ORDER BY o.created_at DESC
LIMIT 10;

-- 3) Backfill (usa política ATUAL do parceiro - não a histórica real).
--    Pedidos antigos sem snapshot continuarão elegíveis via fallback em create_return_request.
--    ATENÇÃO: captured_at no JSON será NOW(), não a data da venda.
BEGIN;

UPDATE public.orders o
SET return_policy_snapshot = public.build_return_policy_snapshot(o.partner_id)
WHERE o.return_policy_snapshot IS NULL
  AND LOWER(COALESCE(o.situation, '')) IN ('paid', 'approved', 'partially_paid')
  AND o.created_at > NOW() - INTERVAL '365 days';

COMMIT;

-- 4) Verificação pós-backfill:
SELECT COUNT(*) AS remaining_without_snapshot
FROM public.orders o
WHERE o.return_policy_snapshot IS NULL
  AND LOWER(COALESCE(o.situation, '')) IN ('paid', 'approved', 'partially_paid')
  AND o.created_at > NOW() - INTERVAL '365 days';
