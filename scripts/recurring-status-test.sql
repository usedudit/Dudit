-- =============================================================================
-- Teste manual no ERP > Assinaturas Recorrentes
-- Rodar no SQL Editor do Supabase (postgres/service role ignora RLS).
--
-- Status aceitos por recurring_subscriptions.status (CHECK atual):
--   active | paused | cancelled | expired | awaiting_restock |
--   pending | past_due | payment_failed | awaiting_customer_decision
--
-- Onde aparece cada status nas abas do ERP:
--   Todas                -> todos os status
--   Ativas               -> active
--   Pausadas             -> paused
--   Aguardando Cobrança  -> pending
--   Com Pendência        -> past_due + payment_failed  (pseudo-aba "delinquent")
--   Sem Estoque          -> awaiting_restock
--   Canceladas           -> cancelled
--   (só em "Todas")      -> expired, awaiting_customer_decision
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Achar o partner_id e ver o que já existe
-- -----------------------------------------------------------------------------
SELECT p.id AS partner_id,
       p.name AS partner,
       count(*) AS assinaturas
FROM recurring_subscriptions rs
JOIN partners p ON p.id = rs.partner_id
GROUP BY 1, 2
ORDER BY 3 DESC;

-- Troque 'PARTNER_AQUI' pelos ids retornados acima em TODOS os blocos abaixo.
SELECT rs.id,
       rs.status,
       c.name AS cliente,
       rp.name AS plano,
       rs.notes,
       rs.next_execution_at
FROM recurring_subscriptions rs
JOIN customers c ON c.id = rs.customer_id
JOIN recurring_plans rp ON rp.id = rs.recurring_plan_id
WHERE rs.partner_id = 'PARTNER_AQUI'
ORDER BY rs.created_at DESC;

-- -----------------------------------------------------------------------------
-- 2) (Só se tiver menos de 9 assinaturas) clona a mais nova até ter 9 linhas
--    Cada clone recebe notes = 'TESTE' para achar depois.
-- -----------------------------------------------------------------------------
WITH base AS (
  SELECT *
  FROM recurring_subscriptions
  WHERE partner_id = 'PARTNER_AQUI'
  ORDER BY created_at DESC
  LIMIT 1
)
INSERT INTO recurring_subscriptions (
  partner_id, customer_id, recurring_plan_id, status,
  next_execution_at, last_execution_at, started_at,
  delivery_type, delivery_address, notes, contracted_amount,
  shipping_amount, shipping_mode, shipping_source
)
SELECT b.partner_id,
       b.customer_id,
       b.recurring_plan_id,
       'active',
       NOW() + (g || ' days')::interval,
       NULL,
       NOW() - (g || ' days')::interval,
       b.delivery_type,
       b.delivery_address,
       'TESTE ' || g,
       b.contracted_amount,
       b.shipping_amount,
       b.shipping_mode,
       b.shipping_source
FROM base b, generate_series(1, 9) AS g;

-- -----------------------------------------------------------------------------
-- 3) Distribui 1 status por assinatura do partner (9 status em rotação)
--    Ajusta também paused_at / cancelled_at / janela de mudança de preço,
--    para o detalhe exibir os dados coerentes com o status.
-- -----------------------------------------------------------------------------
WITH estados AS (
  SELECT id,
         (
           ARRAY[
             'active', 'paused', 'cancelled', 'expired', 'awaiting_restock',
             'pending', 'past_due', 'payment_failed', 'awaiting_customer_decision'
           ]::text[]
         )[
           (((row_number() OVER (ORDER BY created_at DESC, id) - 1) % 9) + 1)::int
         ] AS novo
  FROM recurring_subscriptions
  WHERE partner_id = 'PARTNER_AQUI'
)
UPDATE recurring_subscriptions rs
SET status = e.novo,
    paused_at = CASE WHEN e.novo = 'paused' THEN NOW() ELSE NULL END,
    cancelled_at = CASE WHEN e.novo = 'cancelled' THEN NOW() ELSE NULL END,
    price_change_requested_at = CASE
      WHEN e.novo = 'awaiting_customer_decision' THEN NOW() - interval '2 days'
      ELSE NULL END,
    price_change_expires_at = CASE
      WHEN e.novo = 'awaiting_customer_decision' THEN NOW() + interval '5 days'
      ELSE NULL END,
    price_change_decision = NULL,
    pending_cancellation_reason = NULL
FROM estados e
WHERE rs.id = e.id;

-- -----------------------------------------------------------------------------
-- 3b) OU seta um status específico em uma assinatura (troque id + status)
-- -----------------------------------------------------------------------------
UPDATE recurring_subscriptions
SET status = 'paused',
    paused_at = NOW(),
    price_change_requested_at = NULL,
    price_change_expires_at = NULL,
    price_change_decision = NULL
WHERE id = 'SUBSCRIPTION_ID_AQUI';

-- Badge "Mudança pendente" na lista (janela de consentimento de preço)
UPDATE recurring_subscriptions
SET status = 'active',
    price_change_requested_at = NOW() - interval '2 days',
    price_change_expires_at = NOW() + interval '5 days',
    price_change_decision = NULL
WHERE id = 'SUBSCRIPTION_ID_AQUI';

-- -----------------------------------------------------------------------------
-- 4) Conferência: quantas assinaturas por status (deve bater com as abas)
-- -----------------------------------------------------------------------------
SELECT status, count(*)
FROM recurring_subscriptions
WHERE partner_id = 'PARTNER_AQUI'
GROUP BY status
ORDER BY status;

-- -----------------------------------------------------------------------------
-- 5) Histórico de execuções da aba "Histórico de Execuções" (detalhe)
--    Preenche os 5 status, com erro no 'failed' (botão "Ver erro")
--    e sem order_id (botão "Ver pedido" fica oculto).
--    Para testar "Ver pedido", copie um id real de orders e troque o NULL.
-- -----------------------------------------------------------------------------
WITH target AS (
  SELECT id, partner_id
  FROM recurring_subscriptions
  WHERE partner_id = 'PARTNER_AQUI'
  ORDER BY created_at DESC
  LIMIT 1
),
novas AS (
  SELECT t.id AS subscription_id,
         t.partner_id,
         g.scheduled,
         g.status,
         g.err,
         g.done
  FROM target t,
       (VALUES
         (NOW() - interval '40 days', 'completed',        NULL,                          NOW() - interval '40 days'),
         (NOW() - interval '30 days', 'completed',        NULL,                          NOW() - interval '30 days'),
         (NOW() - interval '21 days', 'failed',           'Erro de pagamento recusado.', NOW() - interval '21 days'),
         (NOW() - interval '14 days', 'awaiting_payment', NULL,                          NULL),
         (NOW() - interval '7 days',  'processing',       NULL,                          NULL),
         (NOW() - interval '2 days',  'pending',          NULL,                          NULL),
         (NOW() + interval '3 days',  'pending',          NULL,                          NULL)
       ) AS g(scheduled, status, err, done)
)
INSERT INTO recurring_executions (
  subscription_id, partner_id, scheduled_for, status,
  order_id, error_message, completed_at, payment_attempts, last_payment_failed_at
)
SELECT n.subscription_id, n.partner_id, n.scheduled, n.status,
       NULL, n.err, n.done,
       CASE WHEN n.status = 'awaiting_payment' THEN 2 ELSE 0 END,
       CASE WHEN n.status = 'awaiting_payment' THEN NOW() - interval '1 day' ELSE NULL END
FROM novas n
ON CONFLICT ON CONSTRAINT recurring_executions_subscription_scheduled_unique DO NOTHING;

-- Ver o histórico gerado
SELECT re.scheduled_for, re.status, re.completed_at, re.error_message, re.order_id
FROM recurring_executions re
JOIN recurring_subscriptions rs ON rs.id = re.subscription_id
WHERE rs.partner_id = 'PARTNER_AQUI'
ORDER BY re.scheduled_for DESC;

-- -----------------------------------------------------------------------------
-- 6) Aba "Planos": status dos planos
--    CHECK aceita: active | inactive | archived
-- -----------------------------------------------------------------------------
UPDATE recurring_plans
SET status = 'active'
WHERE partner_id = 'PARTNER_AQUI';

-- -----------------------------------------------------------------------------
-- 7) RESET: volta tudo para o normal e apaga as linhas de teste
-- -----------------------------------------------------------------------------
UPDATE recurring_subscriptions
SET status = 'active',
    paused_at = NULL,
    cancelled_at = NULL,
    price_change_requested_at = NULL,
    price_change_expires_at = NULL,
    price_change_decision = NULL,
    pending_cancellation_reason = NULL,
    notes = NULL
WHERE partner_id = 'PARTNER_AQUI'
  AND (notes LIKE 'TESTE%' OR status <> 'active');

-- Apaga as assinaturas clonadas de teste (executions caem em cascade)
DELETE FROM recurring_subscriptions
WHERE partner_id = 'PARTNER_AQUI'
  AND notes LIKE 'TESTE%';

-- Remove execuções de teste que não pertencem a assinatura clonada
DELETE FROM recurring_executions re
USING recurring_subscriptions rs
WHERE rs.id = re.subscription_id
  AND rs.partner_id = 'PARTNER_AQUI'
  AND re.scheduled_for > NOW() - interval '60 days'
  AND re.order_id IS NULL;

-- =============================================================================
-- 8) SEED COMPLETO: assinatura de teste visível NO ERP E NO MARKETPLACE
--    (mesma assinatura criada em 2026-10-09; rode de novo só se apagar)
--
--    partner   = e83fba88-58d0-42f2-84dd-3177d19531f3  (Dudit)
--    store     = 64ef9576-05bd-47dd-a1a8-dc26621efb6e  (loja "Dudit")
--    user      = 6b9c40bd-cbf3-4ebf-9027-2cdd4d70e3c4  (login do marketplace)
--    customer  = resolve pelo user_id do login acima   -> 437c455d-378a-439f-93b5-1de1ba2384bd
--    plan      = "plano teste" (ativo, R$ 56,70, mensal, 3x produto)
-- =============================================================================

-- 8.1) Confirmação dos vínculos
SELECT c.id AS customer_id, c.user_id, c.name, c.email
FROM customers c
WHERE c.user_id = '6b9c40bd-cbf3-4ebf-9027-2cdd4d70e3c4';

SELECT id, name, status, price, store_id, show_in_marketplace, fulfillment_modes
FROM recurring_plans
WHERE partner_id = 'e83fba88-58d0-42f2-84dd-3177d19531f3'
  AND status = 'active';

-- 8.2) Cria a assinatura (o trigger AFTER INSERT grava o snapshot de itens e o
--      contracted_amount; se não existir plano, troque o :plan_id abaixo)
WITH cfg AS (
  SELECT 'e83fba88-58d0-42f2-84dd-3177d19531f3'::uuid        AS partner_id,
         '64ef9576-05bd-47dd-a1a8-dc26621efb6e'::uuid        AS store_id,
         'd8a2dfc0-14a5-47fb-adfe-f331e117588d'::uuid        AS plan_id,
         '437c455d-378a-439f-93b5-1de1ba2384bd'::uuid        AS customer_id
)
INSERT INTO recurring_subscriptions (
  partner_id, store_id, customer_id, recurring_plan_id, status,
  next_execution_at, started_at, delivery_type, delivery_address, notes
)
SELECT cfg.partner_id, cfg.store_id, cfg.customer_id, cfg.plan_id, 'active',
       NOW() + interval '3 days', NOW(), 'delivery',
       'Rua José Canuto Barbosa, 286 - Lado Sul, Lucélia - SP, 17783-124',
       'TESTE ERP + Marketplace'
FROM cfg
WHERE NOT EXISTS (
  SELECT 1 FROM recurring_subscriptions
  WHERE customer_id = cfg.customer_id
    AND recurring_plan_id = cfg.plan_id
    AND status IN ('active', 'paused')
);

-- 8.3) Histórico de execuções (aba "Histórico de Execuções" do detalhe)
WITH cfg AS (
  SELECT 'e83fba88-58d0-42f2-84dd-3177d19531f3'::uuid AS partner_id,
         (SELECT id FROM recurring_subscriptions
          WHERE notes = 'TESTE ERP + Marketplace' ORDER BY created_at DESC LIMIT 1) AS sub_id
)
INSERT INTO recurring_executions (
  subscription_id, partner_id, scheduled_for, status, order_id, error_message,
  completed_at, payment_attempts, last_payment_failed_at
)
SELECT cfg.sub_id, cfg.partner_id, g.scheduled_at, g.status, g.order_id, g.err,
       g.completed_at,
       CASE WHEN g.status = 'awaiting_payment' THEN 2 ELSE 0 END,
       CASE WHEN g.status = 'awaiting_payment' THEN NOW() - interval '4 days' ELSE NULL END
FROM cfg,
     (VALUES
       (NOW() - interval '35 days', 'completed',        '816be2d5-d01b-40b1-b8f7-60620e0cb7b9'::uuid, NULL::text,                                NOW() - interval '35 days'),
       (NOW() - interval '24 days', 'completed',        NULL::uuid,                                 NULL::text,                                NOW() - interval '24 days'),
       (NOW() - interval '13 days', 'failed',           NULL::uuid,                                 'Pagamento recusado no cartao de credito.', NOW() - interval '13 days'),
       (NOW() - interval '5 days',  'awaiting_payment', NULL::uuid,                                 NULL::text,                                NULL::timestamptz)
     ) AS g(scheduled_at, status, order_id, err, completed_at)
WHERE cfg.sub_id IS NOT NULL
ON CONFLICT ON CONSTRAINT recurring_executions_subscription_scheduled_unique DO NOTHING;

-- 8.4) Ver o que foi criado (id da assinatura de teste)
SELECT rs.id, rs.status, rs.contracted_amount, rs.next_execution_at,
       rs.price_change_expires_at, c.name AS cliente, rp.name AS plano
FROM recurring_subscriptions rs
JOIN customers c ON c.id = rs.customer_id
JOIN recurring_plans rp ON rp.id = rs.recurring_plan_id
WHERE rs.notes = 'TESTE ERP + Marketplace';

-- =============================================================================
-- 9) Apagar o seed de teste (assinatura + execuções em cascade)
-- =============================================================================
-- DELETE FROM recurring_subscriptions WHERE notes = 'TESTE ERP + Marketplace';

