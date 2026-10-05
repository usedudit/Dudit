-- Backfill de loja em planos e assinaturas recorrentes.
--
-- Contexto: recurring_plans.store_id e recurring_subscriptions.store_id existem
-- desde 20260726 mas nada os preenchia. Sem store_id:
--   * createRecurringOrder gravava pedidos com store_id NULL (DRE filtrado por
--     loja excluia os pedidos de assinatura);
--   * o exportador de assinaturas (filtra por store_id) devolvia 0 linhas.
--
-- Regra: plano herda a loja padrao (mais antiga) do parceiro; assinatura herda
-- a loja do plano; sobrando, a loja padrao do parceiro.

-- 1) Planos ainda sem loja -> loja padrao do parceiro.
UPDATE recurring_plans rp
SET store_id = s.id
FROM (
  SELECT DISTINCT ON (partner_id) partner_id, id
  FROM stores
  ORDER BY partner_id, created_at ASC, id ASC
) s
WHERE rp.store_id IS NULL
  AND s.partner_id = rp.partner_id;

-- 2) Assinaturas herdam a loja do proprio plano.
UPDATE recurring_subscriptions rs
SET store_id = rp.store_id
FROM recurring_plans rp
WHERE rs.store_id IS NULL
  AND rp.id = rs.recurring_plan_id
  AND rp.store_id IS NOT NULL;

-- 3) Assinaturas ainda sem loja -> loja padrao do parceiro.
UPDATE recurring_subscriptions rs
SET store_id = s.id
FROM (
  SELECT DISTINCT ON (partner_id) partner_id, id
  FROM stores
  ORDER BY partner_id, created_at ASC, id ASC
) s
WHERE rs.store_id IS NULL
  AND s.partner_id = rs.partner_id;
