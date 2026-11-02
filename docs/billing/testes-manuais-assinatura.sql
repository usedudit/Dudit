-- ============================================================================
-- Dudit · Testes manuais de assinatura (rodar direto no SQL Editor / psql)
-- ============================================================================
--
-- COMO USAR:
--   1. Rode a seção SETUP (cria 3 parceiros de teste com IDs fixos)
--   2. Rode os comandos de TESTE um a um, na ordem que quiser
--   3. Use as queries de VERIFICAÇÃO para conferir o resultado
--   4. No fim rode CLEANUP (apaga os parceiros de teste)
--
-- O que cada teste faz:
--   sync_subscription_to_billing(sub_id, status_override, period_start, period_end, record_payment)
--   status_override: 'active' | 'trial' | 'pending' | 'past_due' | 'error' | 'cancelled' | 'paused'
--   period_start/end: opcional, força o ciclo (ex: now(), now() + interval '1 month')
--   record_payment: opcional, força gravar pagamento (default: true se não tem MP preapproval)
--
-- Retorna JSON com: success, subscription_id, plan_name, plan_price,
--   current_purchase_id, current_purchase_status, current_period_start, current_period_end,
--   current_invoice_number, next_purchase_id, next_due_date, next_invoice_number
-- ============================================================================


-- ============================================================================
-- SETUP · Parceiros de teste (IDs fixos, fáceis de limpar)
-- ============================================================================

-- Desativa o guard de "Método Dinheiro" só para este setup
SET dudid.bypass_payment_method_guard = true;

-- Limpa qualquer lixo anterior
DELETE FROM public.partners WHERE id IN (
  '00000000-0000-4000-8000-0000000b0001',  -- PARCEIRO 1: plano ativo (Crescer)
  '00000000-0000-4000-8000-0000000b0002',  -- PARCEIRO 2: trial / pending / past_due
  '00000000-0000-4000-8000-0000000b0003'   -- PARCEIRO 3: upgrade / downgrade / cancelamento
);
DELETE FROM auth.users WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

-- Usuários
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role) VALUES
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'test1@dudit.local', crypt('x', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'test2@dudit.local', crypt('x', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'test3@dudit.local', crypt('x', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated');

-- Parceiros
INSERT INTO public.partners (id, user_id) VALUES
  ('00000000-0000-4000-8000-0000000b0001', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-0000000b0002', '22222222-2222-4222-8222-222222222222'),
  ('00000000-0000-4000-8000-0000000b0003', '33333333-3333-4333-8333-333333333333');

-- Planos (referência)
-- free       | Começar   | 0.00   | ec67b83d-1799-49ca-a399-6006c85f2a8f
-- crescer    | Crescer   | 19.90  | 0d1437cb-4e2f-43b3-8088-26b8255a437d
-- escalar    | Escalar   | 0.50   | 852757a9-7fd0-47a5-ad58-23fda8e9ed49

-- PARCEIRO 1 · Assinatura ATIVA no Crescer (19,90) com MP preapproval
-- Ciclo: começou 10 dias atrás, termina daqui a 20 dias
INSERT INTO public.subscriptions (
  partner_id, plan_id, status, mercado_pago_subscription_id, billing_email,
  current_period_start, current_period_end, billing_anchor_day, plan_snapshot
)
SELECT
  '00000000-0000-4000-8000-0000000b0001', pl.id, 'active', 'preapp-test1-active',
  'test1@dudit.local',
  (now() - interval '10 days')::timestamptz,
  (now() + interval '20 days')::timestamptz,
  EXTRACT(DAY FROM (now() - interval '10 days') AT TIME ZONE 'America/Sao_Paulo')::int,
  to_jsonb(pl)
FROM public.plans pl WHERE pl.slug = 'crescer';

-- PARCEIRO 2 · Assinatura limpa (sem MP preapproval) — para testar trial, pending, past_due
-- Ciclo: começa agora, termina daqui a 30 dias
INSERT INTO public.subscriptions (
  partner_id, plan_id, status, billing_email,
  current_period_start, current_period_end, billing_anchor_day, plan_snapshot
)
SELECT
  '00000000-0000-4000-8000-0000000b0002', pl.id, 'active', 'test2@dudit.local',
  now()::timestamptz,
  (now() + interval '30 days')::timestamptz,
  EXTRACT(DAY FROM now() AT TIME ZONE 'America/Sao_Paulo')::int,
  to_jsonb(pl)
FROM public.plans pl WHERE pl.slug = 'crescer';

-- PARCEIRO 3 · Assinatura ATIVA no Escalar (0,50) com MP preapproval — para upgrade/downgrade
INSERT INTO public.subscriptions (
  partner_id, plan_id, status, mercado_pago_subscription_id, billing_email,
  current_period_start, current_period_end, billing_anchor_day, plan_snapshot
)
SELECT
  '00000000-0000-4000-8000-0000000b0003', pl.id, 'active', 'preapp-test3-active',
  'test3@dudit.local',
  (now() - interval '10 days')::timestamptz,
  (now() + interval '20 days')::timestamptz,
  EXTRACT(DAY FROM (now() - interval '10 days') AT TIME ZONE 'America/Sao_Paulo')::int,
  to_jsonb(pl)
FROM public.plans pl WHERE pl.slug = 'escalar';

-- Reativa o guard
SET dudid.bypass_payment_method_guard = false;

-- Confere o setup
SELECT s.id AS sub_id, s.partner_id, pl.slug AS plano, s.status,
       s.mercado_pago_subscription_id,
       s.current_period_start, s.current_period_end,
       s.billing_anchor_day
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.partner_id IN (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-4000-8000-0000000b0002',
  '00000000-0000-4000-8000-0000000b0003'
)
ORDER BY s.partner_id, s.created_at;


-- ============================================================================
-- TESTES · Comandos prontos para copiar/colar
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PARCEIRO 1 · Já tem assinatura ativa com MP (Crescer 19,90)
-- Use estes IDs nas chamadas abaixo:
--   sub_id_1 = (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0001' ORDER BY created_at DESC LIMIT 1)
-- ---------------------------------------------------------------------------

-- 1.1 Sincroniza ciclo atual (mantém active) — gera fatura do ciclo corrente
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0001' ORDER BY created_at DESC LIMIT 1)
);

-- 1.2 Força status PAST_DUE (simula cartão recusado) — gera fatura rejected + QR Code PIX
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0001' ORDER BY created_at DESC LIMIT 1),
  'past_due'
);

-- 1.3 Volta para ACTIVE (pagamento aprovado) — fatura vira approved
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0001' ORDER BY created_at DESC LIMIT 1),
  'active'
);

-- 1.4 Simula UPGRADE para Escalar: cria tentativa pending (o app faz isso via createMpSubscription)
--    Aqui só simulamos o estado: subscription pending + fatura pending
--    (o upgrade real abre checkout no MP e cria subscription pending à parte)

-- 1.5 CANCELAMENTO agendado (fim do ciclo) — mantém acesso até current_period_end
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0001' ORDER BY created_at DESC LIMIT 1),
  'cancelled'
);


-- ---------------------------------------------------------------------------
-- PARCEIRO 2 · Sem MP preapproval (manual) — ideal para testar todos status
--   sub_id_2 = (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1)
-- ---------------------------------------------------------------------------

-- 2.1 ATIVO (padrão) — gera purchase completed + fatura issued
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'active'
);

-- 2.2 TRIAL (30 dias) — trial_end = fim do ciclo, purchase pending
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'trial'
);

-- 2.3 PENDING (aguardando checkout) — purchase pending, sem pagamento
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'pending'
);

-- 2.4 PAST_DUE (erro de pagamento) — purchase rejected, grace period 3 dias
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'past_due'
);

-- 2.5 Volta de past_due para ACTIVE (pagou no grace period)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'active'
);

-- 2.6 CANCELADO imediato — cancela purchase aberto, arquiva excedentes
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'cancelled'
);

-- 2.7 Reativa depois de cancelado (novo ciclo)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'active'
);

-- 2.8 PAUSADO — mantém contrato, não gera cobrança
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'paused'
);

-- 2.9 Força ciclo customizado (ex: cobrança de mês passado)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'active',
  (now() - interval '1 month')::timestamptz,   -- period_start
  now()::timestamptz                           -- period_end
);

-- 2.10 Força ciclo futuro (próximo mês) — preview da próxima fatura
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0002' ORDER BY created_at DESC LIMIT 1),
  'active',
  (now() + interval '1 month')::timestamptz,
  (now() + interval '2 months')::timestamptz
);


-- ---------------------------------------------------------------------------
-- PARCEIRO 3 · Assinatura ativa no Escalar (0,50) com MP — UPGRADE / DOWNGRADE
--   sub_id_3 = (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0003' ORDER BY created_at DESC LIMIT 1)
-- ---------------------------------------------------------------------------

-- 3.1 Estado inicial: Escalar ativo, sincroniza ciclo atual
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0003' ORDER BY created_at DESC LIMIT 1)
);

-- 3.2 UPGRADE para Crescer (simula: app cria subscription pending à parte)
--     Aqui só marcamos pending_plan_id na assinatura ATUAL (o que o app faz no downgrade pago→pago)
UPDATE public.subscriptions
   SET pending_plan_id = (SELECT id FROM plans WHERE slug = 'crescer'),
       cancel_at_period_end = false
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND status = 'active';

-- 3.3 VERIFICA: plano atual continua Escalar, pending_plan_id = Crescer
SELECT s.id, s.plan_id, pl.slug AS plano_atual, s.pending_plan_id, pl2.slug AS proximo_plano,
       s.cancel_at_period_end, s.mercado_pago_subscription_id
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.plans pl2 ON pl2.id = s.pending_plan_id
WHERE s.partner_id = '00000000-0000-4000-8000-0000000b0003' AND s.status = 'active';

-- 3.4 Aplica a troca agendada (o que o cron/helper faz no fim do ciclo):
--     Rotaciona NA MESMA LINHA para Crescer, MANTÉM o preapproval
UPDATE public.subscriptions s
   SET plan_id = (SELECT id FROM plans WHERE slug = 'crescer'),
       plan_snapshot = (SELECT to_jsonb(p) FROM plans p WHERE p.slug = 'crescer'),
       pending_plan_id = NULL,
       cancel_at_period_end = false,
       current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND s.status = 'active'
   AND s.pending_plan_id IS NOT NULL;

-- 3.5 Sincroniza o NOVO ciclo (já no Crescer 19,90)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0003' ORDER BY created_at DESC LIMIT 1)
);

-- 3.6 DOWNGRADE para Começar (grátis) — agenda cancelamento + limpa preapproval
UPDATE public.subscriptions
   SET pending_plan_id = (SELECT id FROM plans WHERE slug = 'free'),
       cancel_at_period_end = true,
       cancelled_at = now()
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND status = 'active';

-- 3.7 VERIFICA: pending_plan_id = free, cancel_at_period_end = true, acesso até fim do ciclo
SELECT s.id, pl.slug AS plano_atual, s.pending_plan_id, pl2.slug AS proximo_plano,
       s.cancel_at_period_end, s.mercado_pago_subscription_id,
       s.current_period_end > now() AS acesso_continua
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.plans pl2 ON pl2.id = s.pending_plan_id
WHERE s.partner_id = '00000000-0000-4000-8000-0000000b0003' AND s.status = 'active';

-- 3.8 Aplica downgrade para grátis (fim do ciclo): rotaciona e LIMPA preapproval
UPDATE public.subscriptions s
   SET plan_id = (SELECT id FROM plans WHERE slug = 'free'),
       plan_snapshot = (SELECT to_jsonb(p) FROM plans p WHERE p.slug = 'free'),
       status = 'active',
       pending_plan_id = NULL,
       cancel_at_period_end = false,
       cancelled_at = NULL,
       ended_at = NULL,
       mercado_pago_subscription_id = NULL,
       current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND s.status = 'active'
   AND s.pending_plan_id IS NOT NULL;

-- 3.9 Sincroniza ciclo no plano grátis (não gera purchase/fatura)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0003' ORDER BY created_at DESC LIMIT 1)
);

-- 3.10 CANCELAMENTO puro (encerra contrato, volta pro plano Começar)
UPDATE public.subscriptions
   SET cancel_at_period_end = true
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND status = 'active';

-- Força fim do ciclo
UPDATE public.subscriptions
   SET current_period_end = now() - interval '1 minute'
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND status = 'active';

-- Aplica cancelamento (mesma lógica do cron)
UPDATE public.subscriptions
   SET status = 'cancelled',
       cancelled_at = now(),
       ended_at = now(),
       cancel_at_period_end = false,
       updated_at = now()
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0003'
   AND status = 'active'
   AND cancel_at_period_end = true
   AND current_period_end <= now();

-- 3.11 Sincroniza cancelado (arquiva excedentes)
SELECT public.sync_subscription_to_billing(
  (SELECT id FROM subscriptions WHERE partner_id = '00000000-0000-4000-8000-0000000b0003' ORDER BY created_at DESC LIMIT 1),
  'cancelled'
);


-- ============================================================================
-- VERIFICAÇÃO · Queries para conferir o estado depois de cada teste
-- ============================================================================

-- V1. Estado geral das 3 assinaturas
SELECT s.id AS sub_id, s.partner_id, pl.slug AS plano, s.status,
       s.pending_plan_id, pl2.slug AS proximo_plano,
       s.cancel_at_period_end, s.cancelled_at, s.ended_at,
       s.mercado_pago_subscription_id,
       s.current_period_start, s.current_period_end,
       s.billing_anchor_day,
       s.past_due_at
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.plans pl2 ON pl2.id = s.pending_plan_id
WHERE s.partner_id IN (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-4000-8000-0000000b0002',
  '00000000-0000-4000-8000-0000000b0003'
)
ORDER BY s.partner_id, s.created_at;

-- V2. Compras/faturas de cada assinatura (histórico de billing)
SELECT bp.id AS purchase_id, bp.subscription_id, pl.slug AS plano,
       bp.status AS purchase_status, bp.total_amount,
       bp.billing_period_start, bp.billing_period_end,
       bp.billing_cycle_start,
       bp.metadata->>'cycle_key' AS cycle_key,
       i.invoice_number, i.status AS invoice_status,
       py.status AS payment_status, py.checkout_url, py.paid_at
FROM public.billing_purchases bp
JOIN public.subscriptions s ON s.id = bp.subscription_id
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.billing_invoices i ON i.purchase_id = bp.id
LEFT JOIN public.billing_payments py ON py.purchase_id = bp.id
WHERE bp.purchase_type = 'subscription'
  AND s.partner_id IN (
    '00000000-0000-4000-8000-0000000b0001',
    '00000000-0000-4000-8000-0000000b0002',
    '00000000-0000-4000-8000-0000000b0003'
  )
ORDER BY s.partner_id, bp.billing_cycle_start DESC, bp.created_at;

-- V3. Próximas faturas (pending) de cada parceiro — o que a tela mostra em "Próxima Fatura"
SELECT s.partner_id, pl.slug AS plano_atual,
       bp.id AS next_purchase_id, bp.status, bp.total_amount,
       bp.billing_period_start AS due_date,
       i.invoice_number,
       py.checkout_url AS payment_url
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.billing_purchases bp
  ON bp.subscription_id = s.id
 AND bp.purchase_type = 'subscription'
 AND bp.status IN ('pending', 'failed')
 AND bp.billing_period_start >= COALESCE(s.current_period_end, now())
LEFT JOIN public.billing_invoices i ON i.purchase_id = bp.id
LEFT JOIN public.billing_payments py ON py.purchase_id = bp.id
WHERE s.partner_id IN (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-4000-8000-0000000b0002',
  '00000000-0000-4000-8000-0000000b0003'
)
ORDER BY s.partner_id, bp.billing_period_start;

-- V4. Tentativas de troca pendentes (upgrade checkout abandonado) — o que aparece em "pending_change"
SELECT s.id AS pending_sub_id, s.partner_id, pl.slug AS plano_tentativa,
       s.status, s.created_at, s.mercado_pago_subscription_id,
       bp.id AS purchase_id, bp.status AS purchase_status,
       i.invoice_number, i.status AS invoice_status,
       py.checkout_url AS payment_url
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.billing_purchases bp ON bp.subscription_id = s.id
LEFT JOIN public.billing_invoices i ON i.purchase_id = bp.id
LEFT JOIN public.billing_payments py ON py.purchase_id = bp.id
WHERE s.status = 'pending'
  AND s.partner_id IN (
    '00000000-0000-4000-8000-0000000b0001',
    '00000000-0000-4000-8000-0000000b0002',
    '00000000-0000-4000-0000-0000000b0003'
  )
ORDER BY s.partner_id, s.created_at DESC;

-- V5. Eventos de billing (auditoria)
SELECT be.partner_id, be.event_type, be.amount, be.metadata, be.created_at
FROM public.billing_events be
WHERE be.partner_id IN (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-4000-8000-0000000b0002',
  '00000000-0000-4000-8000-0000000b0003'
)
ORDER BY be.created_at DESC
LIMIT 30;


-- ============================================================================
-- CLEANUP · Apaga os parceiros de teste (rode no fim)
-- ============================================================================

-- Desativa o guard de "Método Dinheiro" para o cleanup
SET dudid.bypass_payment_method_guard = true;

DELETE FROM public.partners WHERE id IN (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-4000-8000-0000000b0002',
  '00000000-0000-4000-8000-0000000b0003'
);
DELETE FROM auth.users WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
);

-- Reativa o guard
SET dudid.bypass_payment_method_guard = false;

-- Confirma limpeza
SELECT count(*) FROM public.partners WHERE id LIKE '00000000-0000-4000-8000-0000000b000%';


-- ============================================================================
-- EXTRAS · Comandos úteis avulsos
-- ============================================================================

-- E1. Lista todas as assinaturas com status e plano
SELECT s.id, s.partner_id, pl.slug, s.status,
       s.current_period_start, s.current_period_end,
       s.cancel_at_period_end, s.pending_plan_id,
       s.mercado_pago_subscription_id
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
ORDER BY s.partner_id, s.created_at;

-- E2. Conta assinaturas por status
SELECT status, count(*) FROM public.subscriptions GROUP BY status ORDER BY status;

-- E3. Conta compras por status
SELECT status, count(*) FROM public.billing_purchases WHERE purchase_type = 'subscription' GROUP BY status ORDER BY status;

-- E4. Faturas emitidas
SELECT i.invoice_number, i.status, bp.total_amount, bp.billing_period_start, bp.partner_id
FROM public.billing_invoices i
JOIN public.billing_purchases bp ON bp.id = i.purchase_id
WHERE bp.purchase_type = 'subscription'
ORDER BY i.created_at DESC
LIMIT 20;

-- E5. Simula o CRON de reconciliação (aplica trocas agendadas vencidas)
--     (mesma query do applyDueScheduledPlanChanges)
SELECT s.id, s.partner_id, pl.slug AS plano_atual,
       pl2.slug AS proximo_plano, s.cancel_at_period_end, s.current_period_end
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.plans pl2 ON pl2.id = s.pending_plan_id
WHERE s.status IN ('active', 'trialing')
  AND s.current_period_end <= now()
  AND (s.pending_plan_id IS NOT NULL OR s.cancel_at_period_end = true);

-- E6. Força aplicação de TODAS as trocas agendadas vencidas (cuidado: afeta produção!)
-- UPDATE public.subscriptions s
--    SET plan_id = s.pending_plan_id,
--        plan_snapshot = (SELECT to_jsonb(p) FROM plans p WHERE p.id = s.pending_plan_id),
--        status = 'active',
--        pending_plan_id = NULL,
--        cancel_at_period_end = false,
--        cancelled_at = NULL,
--        ended_at = NULL,
--        mercado_pago_subscription_id = CASE WHEN (SELECT price FROM plans WHERE id = s.pending_plan_id) <= 0 THEN NULL ELSE s.mercado_pago_subscription_id END,
--        current_period_start = now(),
--        current_period_end = now() + interval '30 days',
--        updated_at = now()
--  WHERE s.status IN ('active', 'trialing')
--    AND s.current_period_end <= now()
--    AND s.pending_plan_id IS NOT NULL;
--
-- UPDATE public.subscriptions
--    SET status = 'cancelled',
--        cancelled_at = now(),
--        ended_at = now(),
--        cancel_at_period_end = false,
--        updated_at = now()
--  WHERE status IN ('active', 'trialing')
--    AND current_period_end <= now()
--    AND cancel_at_period_end = true
--    AND pending_plan_id IS NULL;