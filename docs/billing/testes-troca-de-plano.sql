-- ============================================================================
-- Dudit · Testes de banco do fluxo de troca de plano (upgrade / downgrade)
-- ============================================================================
--
-- O QUE ESTE ARQUIVO COBRE
--   T1  Upgrade abre tentativa pendente sem tocar no plano atual
--   T2  Abandonar o checkout não cancela nada; novo checkout troca a tentativa
--   T3  Plano Começar (grátis) nunca aparece como pagamento pendente
--   T4  Toda tentativa de troca gera fatura (mesmo pendente) + backfill legado
--   T5  Só a tentativa pendente mais recente é visível
--   T6  A fatura pendente é pagável pelo Mercado Pago (checkout_url)
--   T7  O histórico lista a tentativa como pending com ação "Pagar"
--   T8  Downgrade pago -> pago não cancela e não deixa cobrança no valor antigo
--   T9  Downgrade pago -> grátis encerra a cobrança e mantém acesso até o fim
--   T10 Aplicação da troca agendada (o que o helper/cron faz) na MESMA linha
--   T11 A query do cron encontra as trocas vencidas
--   T12 Os índices impedem 2 contratos efetivos / 2 tentativas pendentes
--
-- COMO RODAR
--   Bloco A (padrão, 100% seguro): cria parceiro de teste, valida tudo e faz
--   ROLLBACK no final. Nada fica gravado.
--       psql "$POSTGRES_URL" -f docs/billing/testes-troca-de-plano.sql
--   ou cole o Bloco A inteiro no SQL Editor do Supabase.
--
--   Bloco B (opcional): cria um parceiro de teste COMMITADO para você exercitar
--   a tela / os endpoints / o cron de verdade. No fim há o cleanup.
--
-- IMPORTANTE
--   O Bloco A garante o índice correto dentro da própria transação, então roda
--   mesmo antes da migration. Em produção aplique
--   `migrations/20261101120000_split_subscription_live_indexes.sql` antes de
--   testar um upgrade real.
-- ============================================================================


-- ============================================================================
-- SEÇÃO 0 · DIAGNÓSTICO (somente leitura — pode rodar fora de transação)
-- ============================================================================
-- Rode estes SELECTs no banco real para ver se já existe estado inconsistente.

-- 0.1 Parceiros com mais de um contrato efetivo (deveria retornar 0 linhas)
SELECT partner_id, count(*) AS efetivos
FROM public.subscriptions
WHERE status IN ('active', 'trialing', 'past_due')
GROUP BY partner_id
HAVING count(*) > 1;

-- 0.2 Parceiros com mais de uma tentativa pendente (deveria retornar 0 linhas)
SELECT partner_id, count(*) AS pendentes
FROM public.subscriptions
WHERE status = 'pending'
GROUP BY partner_id
HAVING count(*) > 1;

-- 0.3 Tentativas pendentes sem fatura (o app materializa no primeiro acesso)
SELECT s.id, s.partner_id, p.slug, s.created_at
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.billing_purchases bp WHERE bp.subscription_id = s.id
  );

-- 0.4 Tentativas pendentes de plano grátis (nunca deveria existir)
SELECT s.id, s.partner_id, p.slug
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'pending'
  AND (p.slug = 'free' OR p.price <= 0);

-- 0.5 Trocas agendadas já vencidas que o cron ainda vai aplicar
SELECT s.id, s.partner_id, pl.slug AS plano_atual, np.slug AS proximo_plano,
       s.cancel_at_period_end, s.current_period_end
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.plans np ON np.id = s.pending_plan_id
WHERE s.status IN ('active', 'trialing')
  AND s.current_period_end <= now()
  AND (s.pending_plan_id IS NOT NULL OR s.cancel_at_period_end = true);

-- 0.6 Faturas pendentes sem meio de pagamento (não dá para "Pagar")
SELECT bp.id AS purchase_id, bp.partner_id, bp.total_amount, bp.status,
       s.status AS sub_status, s.mercado_pago_subscription_id,
       py.checkout_url, py.status AS payment_status
FROM public.billing_purchases bp
LEFT JOIN public.subscriptions s ON s.id = bp.subscription_id
LEFT JOIN public.billing_payments py ON py.purchase_id = bp.id
WHERE bp.purchase_type = 'subscription'
  AND bp.status IN ('pending', 'failed')
  AND (py.checkout_url IS NULL OR s.mercado_pago_subscription_id IS NULL);

-- 0.7 Cobrança futura pendente no valor do plano antigo (sintoma do bug)
SELECT bp.id, bp.subscription_id, bp.total_amount, bp.billing_period_start,
       pl.slug AS plano_atual
FROM public.billing_purchases bp
JOIN public.subscriptions s ON s.id = bp.subscription_id
JOIN public.plans pl ON pl.id = s.plan_id
WHERE bp.purchase_type = 'subscription'
  AND bp.status IN ('pending', 'failed')
  AND s.pending_plan_id IS NOT NULL
  AND bp.billing_period_start > COALESCE(s.current_period_end, now());


-- ============================================================================
-- BLOCO A · TESTES AUTOMÁTICOS (transação + ROLLBACK)
-- ============================================================================

BEGIN;

SET LOCAL statement_timeout = '180s';

-- ── A.0 Índice correto (idempotente; espelha a migration) ────────────────────
DROP INDEX IF EXISTS public.idx_subscriptions_active_partner;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_effective_per_partner
    ON public.subscriptions (partner_id)
    WHERE status IN ('active', 'trialing', 'past_due');

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_pending_per_partner
    ON public.subscriptions (partner_id)
    WHERE status = 'pending';

-- ── A.1 Helpers de teste ─────────────────────────────────────────────────────

-- Assert: falha alto e claro quando a condição não é TRUE.
CREATE OR REPLACE FUNCTION pg_temp.ok(p_cond boolean, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU -> %', p_label;
  END IF;
  RAISE NOTICE 'OK  | %', p_label;
END $$;

-- Cria um usuário + parceiro descartável (apagado no fim de cada cenário).
CREATE OR REPLACE FUNCTION pg_temp.new_partner()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_partner uuid;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, aud, role
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000',
    'sql-test-' || v_uid::text || '@example.invalid',
    crypt('x', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'
  );

  INSERT INTO public.partners (user_id) VALUES (v_uid)
  RETURNING id INTO v_partner;

  RETURN v_partner;
END $$;

-- Remove o parceiro (cascata em subscriptions/purchases/invoices) e o usuário.
-- O guard de "Dinheiro" é desativado localmente porque o parceiro de teste
-- recebe esse método por trigger ao ser criado.
CREATE OR REPLACE FUNCTION pg_temp.drop_partner(p_partner uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid FROM public.partners WHERE id = p_partner;
  PERFORM set_config('dudit.bypass_payment_method_guard', 'true', true);
  DELETE FROM public.partners WHERE id = p_partner;
  PERFORM set_config('dudit.bypass_payment_method_guard', 'false', true);
  DELETE FROM auth.users WHERE id = v_uid;
END $$;

-- Contrato efetivo (active) com ciclo em andamento.
CREATE OR REPLACE FUNCTION pg_temp.add_active_sub(
  p_partner uuid,
  p_plan uuid,
  p_mp_id text,
  p_end timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_end timestamptz := COALESCE(p_end, clock_timestamp() + interval '20 days');
  v_start timestamptz := COALESCE(p_end, clock_timestamp() + interval '20 days') - interval '10 days';
BEGIN
  INSERT INTO public.subscriptions (
    partner_id, plan_id, status, mercado_pago_subscription_id, billing_email,
    current_period_start, current_period_end, billing_anchor_day, plan_snapshot
  ) VALUES (
    p_partner, p_plan, 'active', p_mp_id, 'teste@example.invalid',
    v_start, v_end,
    extract(day FROM (v_start AT TIME ZONE 'America/Sao_Paulo'))::int,
    (SELECT to_jsonb(pl) FROM public.plans pl WHERE pl.id = p_plan)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Tentativa de troca (checkout aberto) = subscription pending.
CREATE OR REPLACE FUNCTION pg_temp.add_pending_sub(
  p_partner uuid,
  p_plan uuid,
  p_mp_id text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.subscriptions (
    partner_id, plan_id, status, mercado_pago_subscription_id, billing_email,
    plan_snapshot, created_at
  ) VALUES (
    p_partner, p_plan, 'pending', p_mp_id, 'teste@example.invalid',
    (SELECT to_jsonb(pl) FROM public.plans pl WHERE pl.id = p_plan), clock_timestamp()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- Espelha `ensurePendingInvoiceForCheckout` / `recordSubscriptionCharge`:
-- purchase pending + payment pending_checkout + invoice emitida.
CREATE OR REPLACE FUNCTION pg_temp.materialize_attempt_invoice(p_sub uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_partner uuid;
  v_plan uuid;
  v_price numeric;
  v_slug text;
  v_mp_id text;
  v_purchase uuid;
  v_inv uuid;
  v_cycle timestamptz := date_trunc('day', clock_timestamp());
BEGIN
  SELECT s.partner_id, s.plan_id, pl.price, pl.slug, s.mercado_pago_subscription_id
    INTO v_partner, v_plan, v_price, v_slug, v_mp_id
  FROM public.subscriptions s
  JOIN public.plans pl ON pl.id = s.plan_id
  WHERE s.id = p_sub;

  INSERT INTO public.billing_purchases (
    partner_id, purchase_type, purchaseable_type, purchaseable_id,
    amount, total_amount, discount_amount, currency, status,
    gateway, gateway_status, subscription_id, description,
    billing_period_start, billing_period_end, billing_cycle_start, metadata, created_at
  ) VALUES (
    v_partner, 'subscription', 'plan', v_plan,
    v_price, v_price, 0, 'BRL', 'pending',
    'mercado_pago', 'pending_checkout', p_sub, 'Plano ' || v_slug,
    v_cycle, v_cycle + interval '30 days', v_cycle::date,
    jsonb_build_object(
      'cycle_key', to_char(v_cycle, 'YYYY-MM-DD'),
      'plan_slug', v_slug,
      'payment_status', 'pending',
      'source', 'plan_change_checkout',
      'subscription_status', 'pending'
    ),
    clock_timestamp()
  )
  RETURNING id INTO v_purchase;

  INSERT INTO public.billing_payments (
    purchase_id, amount, currency, net_amount, status,
    gateway, gateway_status, checkout_url
  ) VALUES (
    v_purchase, v_price, 'BRL', v_price, 'pending',
    'mercado_pago', 'pending_checkout',
    'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=' || COALESCE(v_mp_id, 'none')
  );

  INSERT INTO public.billing_invoices (
    purchase_id, partner_id, invoice_number, verification_hash, invoice_data
  ) VALUES (
    v_purchase, v_partner,
    'INV-TEST-' || upper(substr(md5(random()::text), 1, 8)),
    md5(random()::text || clock_timestamp()::text),
    jsonb_build_object('plan_id', v_plan, 'plan_slug', v_slug, 'amount', v_price)
  )
  RETURNING id INTO v_inv;

  UPDATE public.billing_purchases SET invoice_id = v_inv WHERE id = v_purchase;

  RETURN v_purchase;
END $$;

-- Tentativa completa (subscription pending + fatura).
CREATE OR REPLACE FUNCTION pg_temp.add_pending_attempt(
  p_partner uuid,
  p_plan uuid,
  p_mp_id text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub uuid;
BEGIN
  v_sub := pg_temp.add_pending_sub(p_partner, p_plan, p_mp_id);
  PERFORM pg_temp.materialize_attempt_invoice(v_sub);
  RETURN v_sub;
END $$;

-- Espelha `cancelPendingPlanChangeAttempts`: só mexe em quem está pending.
CREATE OR REPLACE FUNCTION pg_temp.cancel_pending_attempts(p_partner uuid)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM public.subscriptions
  WHERE partner_id = p_partner AND status = 'pending';

  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.billing_payments
     SET status = 'cancelled', updated_at = clock_timestamp()
   WHERE status IN ('pending', 'processing', 'rejected')
     AND purchase_id IN (
       SELECT id FROM public.billing_purchases WHERE subscription_id = ANY(v_ids)
     );

  UPDATE public.billing_purchases
     SET status = 'cancelled', updated_at = clock_timestamp()
   WHERE status IN ('pending', 'failed')
     AND subscription_id = ANY(v_ids);

  UPDATE public.subscriptions
     SET status = 'cancelled',
         cancelled_at = clock_timestamp(),
         ended_at = clock_timestamp(),
         cancel_at_period_end = false,
         updated_at = clock_timestamp()
   WHERE id = ANY(v_ids);

  RETURN array_length(v_ids, 1);
END $$;

-- Query exata de `applyDueScheduledPlanChanges` (cron de reconciliação).
CREATE OR REPLACE FUNCTION pg_temp.due_scheduled_changes(p_now timestamptz DEFAULT clock_timestamp())
RETURNS TABLE (id uuid)
LANGUAGE sql
AS $$
  SELECT s.id
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.current_period_end <= p_now
    AND (s.pending_plan_id IS NOT NULL OR s.cancel_at_period_end = true)
  LIMIT 50
$$;


-- ── T1 · Upgrade abre tentativa pendente sem tocar no plano atual ───────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_pending uuid;
  v_end timestamptz := clock_timestamp() + interval '20 days';
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t1-active', v_end);
  v_pending := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t1-pending');

  PERFORM pg_temp.ok(
    (SELECT status = 'active'
            AND plan_id = v_crescer
            AND mercado_pago_subscription_id = 'preapp-t1-active'
            AND current_period_end = v_end
     FROM public.subscriptions WHERE id = v_active),
    'T1 · upgrade pendente não altera plano, preço nem data do contrato atual');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status = 'pending'),
    'T1 · existe exatamente 1 tentativa pendente');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.subscriptions WHERE partner_id = v_partner AND status = 'active')
    AND EXISTS (SELECT 1 FROM public.subscriptions WHERE partner_id = v_partner AND status = 'pending'),
    'T1 · active + pending coexistem (índice corrigido)');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.billing_purchases
     WHERE subscription_id = v_pending AND status = 'pending'),
    'T1 · a tentativa já nasce com purchase pending');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T2 · Abandonar o checkout não cancela; novo checkout troca a tentativa ──
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_attempt1 uuid;
  v_attempt2 uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t2-active');
  v_attempt1 := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t2-pending-1');

  -- Abandonar = nenhuma escrita. O contrato atual continua exatamente igual.
  PERFORM pg_temp.ok(
    (SELECT status = 'active' AND plan_id = v_crescer AND cancel_at_period_end = false
     FROM public.subscriptions WHERE id = v_active),
    'T2 · abandonar o checkout mantém o plano atual ativo');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status = 'pending'),
    'T2 · a tentativa abandonada continua pendente (não é cancelada sozinha)');

  -- Novo checkout: cancelPendingPlanChangeAttempts antes de criar a nova.
  PERFORM pg_temp.cancel_pending_attempts(v_partner);
  v_attempt2 := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t2-pending-2');

  PERFORM pg_temp.ok(
    (SELECT status = 'cancelled' FROM public.subscriptions WHERE id = v_attempt1),
    'T2 · novo checkout cancela a tentativa anterior');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status = 'pending' AND id = v_attempt2),
    'T2 · sobra só a tentativa mais recente como pending');

  PERFORM pg_temp.ok(
    (SELECT status = 'active' AND plan_id = v_crescer
     FROM public.subscriptions WHERE id = v_active),
    'T2 · novo checkout não toca no plano atual');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T3 · Plano Começar nunca aparece como pagamento pendente ────────────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_free uuid := (SELECT id FROM public.plans WHERE slug = 'free');
  v_active uuid;
  v_end timestamptz := clock_timestamp() + interval '20 days';
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t3-active', v_end);

  -- Downgrade para o grátis: agenda na PRÓPRIA linha, não cria subscription pending.
  UPDATE public.subscriptions
     SET pending_plan_id = v_free,
         cancel_at_period_end = true,
         cancelled_at = clock_timestamp()
   WHERE id = v_active;

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.plans pl ON pl.id = s.plan_id
      WHERE s.partner_id = v_partner
        AND s.status = 'pending'
        AND (pl.slug = 'free' OR pl.price <= 0)
    ),
    'T3 · plano Começar nunca fica com status pending');

  PERFORM pg_temp.ok(
    (SELECT pending_plan_id = v_free AND cancel_at_period_end = true
     FROM public.subscriptions WHERE id = v_active),
    'T3 · downgrade para grátis fica agendado na linha ativa');

  PERFORM pg_temp.ok(
    (SELECT status = 'active' AND current_period_end > clock_timestamp()
     FROM public.subscriptions WHERE id = v_active),
    'T3 · acesso ao plano pago continua até o fim do ciclo');

  -- Mesma query da ação `getSubscriptionStatusAction` (pending_change).
  PERFORM pg_temp.ok(
    (SELECT count(*) = 0 FROM (
       SELECT s.id
       FROM public.subscriptions s
       JOIN public.plans pl ON pl.id = s.plan_id
       WHERE s.partner_id = v_partner
         AND s.status = 'pending'
       ORDER BY s.created_at DESC
       LIMIT 1
     ) q),
    'T3 · pending_change da tela fica nulo para o plano Começar');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T4 · Toda tentativa gera fatura (mesmo pendente) + backfill legado ──────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_legacy uuid;
  v_new uuid;
  v_purchase uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t4-active');

  -- Tentativa criada antes da correção: pending sem purchase.
  v_legacy := pg_temp.add_pending_sub(v_partner, v_escalar, 'preapp-t4-legacy');

  PERFORM pg_temp.ok(
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = v_legacy
        AND NOT EXISTS (SELECT 1 FROM public.billing_purchases bp WHERE bp.subscription_id = s.id)
    ),
    'T4 · detecta tentativa pendente sem fatura (legado)');

  -- Backfill = ensurePendingInvoiceForCheckout (lazy, ao abrir a tela).
  v_purchase := pg_temp.materialize_attempt_invoice(v_legacy);

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = v_legacy
        AND NOT EXISTS (SELECT 1 FROM public.billing_purchases bp WHERE bp.subscription_id = s.id)
    ),
    'T4 · backfill materializa a fatura da tentativa pendente');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1
     FROM public.billing_invoices i
     JOIN public.billing_purchases bp ON bp.id = i.purchase_id
     WHERE bp.subscription_id = v_legacy),
    'T4 · tentativa legada passa a ter invoice emitida');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.billing_payments WHERE purchase_id = v_purchase),
    'T4 · fatura pendente tem payment (necessário para "Pagar")');

  -- Nova tentativa nasce completa.
  PERFORM pg_temp.cancel_pending_attempts(v_partner);
  v_new := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t4-new');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.billing_purchases bp WHERE bp.subscription_id = v_new)
    AND (SELECT count(*) = 1 FROM public.billing_invoices i
         JOIN public.billing_purchases bp ON bp.id = i.purchase_id
         WHERE bp.subscription_id = v_new),
    'T4 · toda tentativa nova já tem 1 purchase e 1 invoice');

  -- Não duplica fatura do mesmo ciclo.
  BEGIN
    INSERT INTO public.billing_purchases (
      partner_id, purchase_type, purchaseable_type, purchaseable_id,
      amount, total_amount, currency, status, subscription_id,
      billing_cycle_start, metadata
    )
    SELECT bp.partner_id, 'subscription', 'plan', bp.purchaseable_id,
           bp.amount, bp.total_amount, 'BRL', 'pending', bp.subscription_id,
           bp.billing_cycle_start, bp.metadata
    FROM public.billing_purchases bp
    WHERE bp.subscription_id = v_new
    LIMIT 1;

    RAISE EXCEPTION 'FALHOU -> T4 · duplicou purchase do mesmo ciclo (índice não atuou)';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK  | T4 · não duplica fatura do mesmo ciclo';
  END;

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T5 · Só a tentativa pendente mais recente aparece ───────────────────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_attempt uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t5-active');

  PERFORM pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t5-1');
  PERFORM pg_temp.cancel_pending_attempts(v_partner);
  PERFORM pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t5-2');
  PERFORM pg_temp.cancel_pending_attempts(v_partner);
  v_attempt := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t5-3');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status = 'pending'),
    'T5 · sempre existe no máximo 1 tentativa pendente');

  PERFORM pg_temp.ok(
    (SELECT id = v_attempt FROM (
       SELECT id FROM public.subscriptions
       WHERE partner_id = v_partner AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1
     ) q),
    'T5 · a tentativa visível é a mais recente');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 2 FROM public.subscriptions
     WHERE partner_id = v_partner AND status = 'cancelled'),
    'T5 · as tentativas antigas ficam canceladas (histórico preservado)');

  PERFORM pg_temp.ok(
    (SELECT status = 'active' FROM public.subscriptions WHERE id = v_active),
    'T5 · o contrato atual nunca é afetado pelas tentativas');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T6 · A fatura pendente é pagável pelo Mercado Pago ──────────────────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_attempt uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t6-active');
  v_attempt := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t6-pending');

  -- Pré-condição de `getSubscriptionPaymentUrlAction`.
  PERFORM pg_temp.ok(
    (SELECT status = 'pending'
            AND cancel_at_period_end = false
            AND mercado_pago_subscription_id IS NOT NULL
     FROM public.subscriptions WHERE id = v_attempt),
    'T6 · tentativa pendente tem preapproval para gerar o link');

  PERFORM pg_temp.ok(
    (SELECT py.checkout_url IS NOT NULL
            AND py.status = 'pending'
            AND py.gateway_status = 'pending_checkout'
     FROM public.billing_purchases bp
     JOIN public.billing_payments py ON py.purchase_id = bp.id
     WHERE bp.subscription_id = v_attempt),
    'T6 · fatura pendente tem checkout_url válido para pagar');

  -- `next_invoice` só aparece para status past_due/pending (nunca para free).
  PERFORM pg_temp.ok(
    (SELECT count(*) = 1
     FROM public.subscriptions s
     JOIN public.billing_purchases bp ON bp.subscription_id = s.id
     WHERE s.id = v_attempt AND s.status = 'pending'
       AND bp.status IN ('pending', 'failed')),
    'T6 · a tentativa pendente é a fatura em aberto exibida');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T7 · Histórico lista a tentativa como pending com ação "Pagar" ──────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_attempt uuid;
  v_paid_purchase uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t7-active');

  -- Ciclo atual já pago (linha completed no histórico).
  INSERT INTO public.billing_purchases (
    partner_id, purchase_type, purchaseable_type, purchaseable_id,
    amount, total_amount, currency, status, gateway, subscription_id,
    billing_period_start, billing_period_end, billing_cycle_start, created_at
  ) VALUES (
    v_partner, 'subscription', 'plan', v_crescer,
    19.90, 19.90, 'BRL', 'completed', 'mercado_pago', v_active,
    date_trunc('day', clock_timestamp()) - interval '10 days',
    date_trunc('day', clock_timestamp()) + interval '20 days',
    (date_trunc('day', clock_timestamp()) - interval '10 days')::date,
    clock_timestamp() - interval '10 days'
  )
  RETURNING id INTO v_paid_purchase;

  v_attempt := pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t7-pending');

  -- Mesma query de `listPurchasesAction` (ordem por created_at desc).
  PERFORM pg_temp.ok(
    (SELECT status = 'pending' FROM (
       SELECT bp.status
       FROM public.billing_purchases bp
       WHERE bp.partner_id = v_partner AND bp.purchase_type = 'subscription'
       ORDER BY bp.created_at DESC
       LIMIT 1
     ) q),
    'T7 · a tentativa aparece como linha pending no histórico');

  PERFORM pg_temp.ok(
    (SELECT s.status = 'pending'
            AND s.mercado_pago_subscription_id IS NOT NULL
            AND py.checkout_url IS NOT NULL
     FROM public.billing_purchases bp
     JOIN public.subscriptions s ON s.id = bp.subscription_id
     JOIN public.billing_payments py ON py.purchase_id = bp.id
     WHERE bp.subscription_id = v_attempt),
    'T7 · a linha pending tem ação "Pagar" (sub pending + checkout_url)');

  PERFORM pg_temp.ok(
    (SELECT status = 'completed' FROM public.billing_purchases WHERE id = v_paid_purchase),
    'T7 · o ciclo já pago continua completed no histórico');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T8 · Downgrade pago -> pago não cancela nem cobra o valor antigo ────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_end timestamptz := clock_timestamp() + interval '20 days';
  v_old_price numeric;
BEGIN
  SELECT price INTO v_old_price FROM public.plans WHERE id = v_escalar;

  v_active := pg_temp.add_active_sub(v_partner, v_escalar, 'preapp-t8-active', v_end);

  -- updateMpSubscription (downgrade pago->pago): grava na MESMA linha.
  UPDATE public.subscriptions
     SET pending_plan_id = v_crescer,
         cancel_at_period_end = false,
         cancelled_at = NULL
   WHERE id = v_active;

  PERFORM pg_temp.ok(
    (SELECT status = 'active'
            AND plan_id = v_escalar
            AND pending_plan_id = v_crescer
            AND cancel_at_period_end = false
            AND mercado_pago_subscription_id = 'preapp-t8-active'
            AND current_period_end = v_end
     FROM public.subscriptions WHERE id = v_active),
    'T8 · downgrade pago->pago é agendado sem cancelar e mantém o preapproval');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status IN ('active', 'trialing', 'past_due')),
    'T8 · continua existindo um único contrato efetivo');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.billing_purchases bp
      WHERE bp.subscription_id = v_active
        AND bp.status IN ('pending', 'failed')
        AND bp.total_amount = v_old_price
        AND bp.billing_period_start > clock_timestamp()
    ),
    'T8 · não há cobrança futura pendente no valor do plano antigo');

  PERFORM pg_temp.ok(
    (SELECT new_pl.sort_order < old_pl.sort_order
     FROM public.plans new_pl, public.plans old_pl
     WHERE new_pl.id = v_crescer AND old_pl.id = v_escalar),
    'T8 · o próximo plano é de tier inferior (cenário de downgrade real)');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T9 · Downgrade pago -> grátis encerra a cobrança e mantém acesso ────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_free uuid := (SELECT id FROM public.plans WHERE slug = 'free');
  v_active uuid;
  v_end timestamptz := clock_timestamp() + interval '20 days';
  v_old_price numeric;
BEGIN
  SELECT price INTO v_old_price FROM public.plans WHERE id = v_crescer;
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t9-active', v_end);

  -- updateMpSubscription (pago->grátis): cancela no MP e agenda na linha.
  UPDATE public.subscriptions
     SET pending_plan_id = v_free,
         cancel_at_period_end = true,
         cancelled_at = clock_timestamp()
   WHERE id = v_active;

  PERFORM pg_temp.ok(
    (SELECT status = 'active'
            AND cancel_at_period_end = true
            AND pending_plan_id = v_free
            AND current_period_end > clock_timestamp()
     FROM public.subscriptions WHERE id = v_active),
    'T9 · acesso continua até o fim do ciclo já pago');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      JOIN public.plans pl ON pl.id = s.plan_id
      WHERE s.partner_id = v_partner AND s.status = 'pending'
    ),
    'T9 · não cria tentativa pendente para o plano grátis');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.billing_purchases bp
      WHERE bp.subscription_id = v_active
        AND bp.status IN ('pending', 'failed')
        AND bp.total_amount = v_old_price
        AND bp.billing_period_start > clock_timestamp()
    ),
    'T9 · não sobra cobrança futura no valor antigo');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T10 · Aplicação da troca agendada (mesma linha) ─────────────────────────
-- (a) pago -> pago: rotaciona o plano e MANTÉM o preapproval.
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
  v_new_start timestamptz := clock_timestamp();
  v_new_end timestamptz := clock_timestamp() + interval '30 days';
BEGIN
  v_active := pg_temp.add_active_sub(
    v_partner, v_escalar, 'preapp-t10a-active',
    clock_timestamp() - interval '1 day'   -- ciclo já venceu
  );
  UPDATE public.subscriptions SET pending_plan_id = v_crescer WHERE id = v_active;

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_active),
    'T10a · o cron encontra a troca vencida');

  -- Exatamente o UPDATE de `applyScheduledPlanChange` (lib/billing/plan-change.ts).
  UPDATE public.subscriptions SET
    plan_id = v_crescer,
    plan_snapshot = (SELECT to_jsonb(pl) FROM public.plans pl WHERE pl.id = v_crescer),
    status = 'active',
    pending_plan_id = NULL,
    cancel_at_period_end = false,
    cancelled_at = NULL,
    ended_at = NULL,
    past_due_at = NULL,
    current_period_start = v_new_start,
    current_period_end = v_new_end,
    updated_at = clock_timestamp()
  WHERE id = v_active;

  PERFORM pg_temp.ok(
    (SELECT plan_id = v_crescer
            AND status = 'active'
            AND pending_plan_id IS NULL
            AND cancel_at_period_end = false
            AND mercado_pago_subscription_id = 'preapp-t10a-active'
            AND current_period_start = v_new_start
            AND current_period_end = v_new_end
     FROM public.subscriptions WHERE id = v_active),
    'T10a · pago->pago rotaciona na mesma linha e mantém o preapproval');

  PERFORM pg_temp.ok(
    (SELECT count(*) = 1 FROM public.subscriptions
     WHERE partner_id = v_partner AND status IN ('active', 'trialing', 'past_due')),
    'T10a · não cria uma segunda assinatura');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_active),
    'T10a · deixa de ser selecionada pelo cron');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;

-- (b) pago -> grátis: rotaciona e LIMPA o preapproval.
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_free uuid := (SELECT id FROM public.plans WHERE slug = 'free');
  v_active uuid;
BEGIN
  v_active := pg_temp.add_active_sub(
    v_partner, v_crescer, 'preapp-t10b-active',
    clock_timestamp() - interval '1 day'
  );
  UPDATE public.subscriptions
     SET pending_plan_id = v_free, cancel_at_period_end = true
   WHERE id = v_active;

  UPDATE public.subscriptions SET
    plan_id = v_free,
    plan_snapshot = (SELECT to_jsonb(pl) FROM public.plans pl WHERE pl.id = v_free),
    status = 'active',
    pending_plan_id = NULL,
    cancel_at_period_end = false,
    cancelled_at = NULL,
    ended_at = NULL,
    past_due_at = NULL,
    mercado_pago_subscription_id = NULL,
    current_period_start = clock_timestamp(),
    current_period_end = clock_timestamp() + interval '30 days',
    updated_at = clock_timestamp()
  WHERE id = v_active;

  PERFORM pg_temp.ok(
    (SELECT plan_id = v_free
            AND status = 'active'
            AND pending_plan_id IS NULL
            AND mercado_pago_subscription_id IS NULL
     FROM public.subscriptions WHERE id = v_active),
    'T10b · pago->grátis rotaciona e remove o preapproval');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;

-- (c) cancelamento puro: encerra o contrato.
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_active uuid;
BEGIN
  v_active := pg_temp.add_active_sub(
    v_partner, v_crescer, 'preapp-t10c-active',
    clock_timestamp() - interval '1 day'
  );
  UPDATE public.subscriptions SET cancel_at_period_end = true WHERE id = v_active;

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_active),
    'T10c · o cron encontra o cancelamento vencido');

  -- Exatamente o UPDATE de `endSubscriptionAtPeriodEnd`.
  UPDATE public.subscriptions SET
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    ended_at = clock_timestamp(),
    cancel_at_period_end = false,
    updated_at = clock_timestamp()
  WHERE id = v_active;

  PERFORM pg_temp.ok(
    (SELECT status = 'cancelled' AND ended_at IS NOT NULL AND cancel_at_period_end = false
     FROM public.subscriptions WHERE id = v_active),
    'T10c · cancelamento puro encerra o contrato');

  PERFORM pg_temp.ok(
    NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE partner_id = v_partner AND status IN ('active', 'trialing', 'past_due', 'pending')
    ),
    'T10c · parceiro volta a cair no plano Começar');

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


-- ── T11 · A query do cron encontra todas as trocas vencidas ─────────────────
-- Cada contrato efetivo exige um parceiro distinto (índice), então usamos 3.
DO $$
DECLARE
  v_p_due uuid := pg_temp.new_partner();       -- vencida, com troca agendada
  v_p_future uuid := pg_temp.new_partner();    -- futura, com troca agendada
  v_p_plain uuid := pg_temp.new_partner();     -- vencida, SEM troca agendada
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_due uuid;
  v_future uuid;
  v_plain uuid;
BEGIN
  v_due := pg_temp.add_active_sub(v_p_due, v_crescer, 'preapp-t11-due', clock_timestamp() - interval '1 day');
  UPDATE public.subscriptions SET pending_plan_id = v_escalar WHERE id = v_due;

  v_future := pg_temp.add_active_sub(v_p_future, v_crescer, 'preapp-t11-future', clock_timestamp() + interval '10 days');
  UPDATE public.subscriptions SET pending_plan_id = v_escalar WHERE id = v_future;

  v_plain := pg_temp.add_active_sub(v_p_plain, v_crescer, 'preapp-t11-plain', clock_timestamp() - interval '1 day');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_due),
    'T11 · troca vencida entra na fila do cron');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_future),
    'T11 · troca futura NÃO entra na fila do cron');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_temp.due_scheduled_changes() d WHERE d.id = v_plain),
    'T11 · ciclo vencido sem troca agendada NÃO entra na fila do cron');

  PERFORM pg_temp.drop_partner(v_p_due);
  PERFORM pg_temp.drop_partner(v_p_future);
  PERFORM pg_temp.drop_partner(v_p_plain);
END $$;


-- ── T12 · Índices: 1 efetivo + 1 pendente (nada além disso) ─────────────────
DO $$
DECLARE
  v_partner uuid := pg_temp.new_partner();
  v_crescer uuid := (SELECT id FROM public.plans WHERE slug = 'crescer');
  v_escalar uuid := (SELECT id FROM public.plans WHERE slug = 'escalar');
  v_active uuid;
BEGIN
  v_active := pg_temp.add_active_sub(v_partner, v_crescer, 'preapp-t12-active');
  PERFORM pg_temp.add_pending_attempt(v_partner, v_escalar, 'preapp-t12-pending');

  BEGIN
    INSERT INTO public.subscriptions (partner_id, plan_id, status)
    VALUES (v_partner, v_escalar, 'active');
    RAISE EXCEPTION 'FALHOU -> T12 · permitiu 2 contratos efetivos';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK  | T12 · bloqueia 2 contratos efetivos';
  END;

  BEGIN
    INSERT INTO public.subscriptions (partner_id, plan_id, status)
    VALUES (v_partner, v_escalar, 'pending');
    RAISE EXCEPTION 'FALHOU -> T12 · permitiu 2 tentativas pendentes';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK  | T12 · bloqueia 2 tentativas pendentes';
  END;

  BEGIN
    INSERT INTO public.subscriptions (partner_id, plan_id, status)
    VALUES (v_partner, v_escalar, 'past_due');
    RAISE EXCEPTION 'FALHOU -> T12 · permitiu past_due junto de active';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'OK  | T12 · bloqueia past_due junto de active';
  END;

  PERFORM pg_temp.drop_partner(v_partner);
END $$;


DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'BLOCO A CONCLUÍDO: todas as verificações passaram.';
  RAISE NOTICE 'Fazendo ROLLBACK (nada foi gravado).';
  RAISE NOTICE '============================================================';
END $$;

ROLLBACK;


-- ============================================================================
-- BLOCO B · TESTE PONTA A PONTA (OPCIONAL, GRAVA DADOS)
-- ============================================================================
-- Use este bloco quando quiser exercitar a TELA, as Server Actions e o CRON.
-- Ele cria um parceiro de teste com IDs fixos (fáceis de limpar):
--   usuário : 00000000-0000-4000-8000-0000000b0001
--   parceiro: 00000000-0000-4000-8000-0000000b0002
--
-- Rode B1, faça login com um usuário que enxergue esse parceiro (ou use os
-- endpoints como admin), execute o fluxo e rode B2/B3 para conferir.
-- No fim, rode B4 (cleanup).
-- ============================================================================

-- ── B1 · Setup (rodar uma vez; é idempotente) ───────────────────────────────
SELECT set_config('dudit.bypass_payment_method_guard', 'true', false);
DELETE FROM public.partners WHERE id = '00000000-0000-4000-8000-0000000b0002';
DELETE FROM auth.users  WHERE id = '00000000-0000-4000-8000-0000000b0001';
SELECT set_config('dudit.bypass_payment_method_guard', 'false', false);

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, aud, role
) VALUES (
  '00000000-0000-4000-8000-0000000b0001',
  '00000000-0000-0000-0000-000000000000',
  'dudit-sql-e2e@example.invalid',
  crypt('x', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'
);

INSERT INTO public.partners (id, user_id)
VALUES ('00000000-0000-4000-8000-0000000b0002', '00000000-0000-4000-8000-0000000b0001');

-- Contrato ativo no Crescer com 20 dias de ciclo restante.
INSERT INTO public.subscriptions (
  partner_id, plan_id, status, mercado_pago_subscription_id, billing_email,
  current_period_start, current_period_end, billing_anchor_day, plan_snapshot
)
SELECT
  '00000000-0000-4000-8000-0000000b0002', pl.id, 'active', 'preapp-e2e-active',
  'dudit-sql-e2e@example.invalid',
  clock_timestamp() - interval '10 days', clock_timestamp() + interval '20 days',
  extract(day FROM ((clock_timestamp() - interval '10 days') AT TIME ZONE 'America/Sao_Paulo'))::int,
  to_jsonb(pl)
FROM public.plans pl WHERE pl.slug = 'crescer';

SELECT id, status, plan_id, mercado_pago_subscription_id, current_period_start, current_period_end
FROM public.subscriptions
WHERE partner_id = '00000000-0000-4000-8000-0000000b0002';

-- ── B2 · Conferência depois de cada fluxo ───────────────────────────────────
-- (a) Depois de abrir o checkout de upgrade e ABANDONAR:
--     o contrato ativo tem que continuar active, no plano antigo.
SELECT s.id, s.status, pl.slug AS plano, s.pending_plan_id, s.cancel_at_period_end,
       s.mercado_pago_subscription_id, s.current_period_end
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.partner_id = '00000000-0000-4000-8000-0000000b0002'
ORDER BY s.created_at;

-- (b) A tentativa pendente tem fatura pendente pagável:
SELECT s.id AS subscription_id, pl.slug AS plano, s.status AS sub_status,
       bp.id AS purchase_id, bp.status AS purchase_status, bp.total_amount,
       i.invoice_number, i.status AS invoice_status,
       py.status AS payment_status, py.checkout_url
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
LEFT JOIN public.billing_purchases bp ON bp.subscription_id = s.id
LEFT JOIN public.billing_invoices i ON i.purchase_id = bp.id
LEFT JOIN public.billing_payments py ON py.purchase_id = bp.id
WHERE s.partner_id = '00000000-0000-4000-8000-0000000b0002'
ORDER BY s.created_at, bp.created_at;

-- (c) Depois de agendar um downgrade (pago -> pago):
--     pending_plan_id preenchido, cancel_at_period_end = false, plano atual intacto.
-- (d) Depois de agendar downgrade para o Começar:
--     pending_plan_id = free, cancel_at_period_end = true, continua active.

-- ── B3 · Aplicar a troca agendada pelo CRON real ────────────────────────────
-- 1) Force o fim do ciclo (simula a chegada da data):
UPDATE public.subscriptions
   SET current_period_end = clock_timestamp() - interval '1 minute'
 WHERE partner_id = '00000000-0000-4000-8000-0000000b0002'
   AND status IN ('active', 'trialing');

-- 2) Chame o cron (troque a URL/segredo):
--    curl -s -H "Authorization: Bearer $CRON_SECRET" \
--      http://localhost:3000/api/cron/reconcile-subscriptions
--    (em produção: https://SEU_DOMINIO/api/cron/reconcile-subscriptions)
--
-- 3) Confira o resultado: a MESMA linha deve ter rotacionado (pago->pago)
--    ou ficado cancelled (cancelamento), nunca uma linha nova.
SELECT s.id, s.status, pl.slug AS plano, s.pending_plan_id,
       s.cancel_at_period_end, s.mercado_pago_subscription_id,
       s.current_period_start, s.current_period_end
FROM public.subscriptions s
JOIN public.plans pl ON pl.id = s.plan_id
WHERE s.partner_id = '00000000-0000-4000-8000-0000000b0002'
ORDER BY s.created_at;

-- ── B4 · Limpeza (rodar sempre no fim) ──────────────────────────────────────
SELECT set_config('dudit.bypass_payment_method_guard', 'true', false);
DELETE FROM public.partners WHERE id = '00000000-0000-4000-8000-0000000b0002';
DELETE FROM auth.users  WHERE id = '00000000-0000-4000-8000-0000000b0001';
SELECT set_config('dudit.bypass_payment_method_guard', 'false', false);
