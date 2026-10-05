-- Fluxo de consentimento de mudanca de preco/itens em assinaturas recorrentes.
--
-- Regras (decididas com o lojista):
--   * Editar itens/preco de um plano abre uma janela de 7 dias para cada
--     assinatura ativa. Durante a janela a cobranca CONTINUA no valor antigo
--     (snapshot de itens + transaction_amount do MP permanecem congelados).
--   * passou o prazo sem resposta -> status 'awaiting_customer_decision'
--     (cobranca congelada) + aviso ao lojista. O cliente ainda pode responder.
--   * aceite -> re-snapshot dos itens, novo contracted_amount, MP atualizado.
--   * recusa -> cliente usa o ciclo vigente e a assinatura e' cancelada ao
--     final dele (pending_cancellation_reason), sem nova cobranca.
--
-- Baseline contratual (contracted_amount + contracted_items_hash) e' gravado
-- pela trigger de snapshot na criacao da assinatura e backfillado abaixo.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Novo estado + colunas de consentimento
-- ---------------------------------------------------------------------------
ALTER TABLE public.recurring_subscriptions
  DROP CONSTRAINT IF EXISTS recurring_subscriptions_status_check;

ALTER TABLE public.recurring_subscriptions
  ADD CONSTRAINT recurring_subscriptions_status_check CHECK (status IN (
    'active',
    'paused',
    'cancelled',
    'expired',
    'awaiting_restock',
    'pending',
    'payment_failed',
    'past_due',
    'awaiting_customer_decision'
  ));

COMMENT ON COLUMN public.recurring_subscriptions.status IS
  'active | paused | cancelled | expired | awaiting_restock | '
  'pending (aguardando webhook do MP) | past_due (dunning em retry) | '
  'payment_failed (tentativas esgotadas) | '
  'awaiting_customer_decision (mudanca de preco/itens expirou sem resposta; cobranca congelada)';

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS contracted_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS contracted_items_hash TEXT,
  ADD COLUMN IF NOT EXISTS price_change_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_change_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_change_decision TEXT,
  ADD COLUMN IF NOT EXISTS pending_cancellation_reason TEXT;

COMMENT ON COLUMN public.recurring_subscriptions.contracted_amount IS
  'Valor contratado (preco do plano + frete congelado) na contratacao/aceite; base da comparacao de mudanca de preco.';
COMMENT ON COLUMN public.recurring_subscriptions.contracted_items_hash IS
  'md5 canonico dos itens do plano na contratacao/aceite; muda quando os itens do plano mudam.';
COMMENT ON COLUMN public.recurring_subscriptions.price_change_requested_at IS
  'Inicio da janela de consentimento de mudanca de preco/itens.';
COMMENT ON COLUMN public.recurring_subscriptions.price_change_expires_at IS
  'Fim da janela de consentimento (7 dias). Enquanto futura, cobra-se o valor antigo.';
COMMENT ON COLUMN public.recurring_subscriptions.price_change_decision IS
  'accepted | rejected quando o cliente responde a mudanca.';
COMMENT ON COLUMN public.recurring_subscriptions.pending_cancellation_reason IS
  'price_change_rejected: assinatura sera cancelada ao termino do ciclo vigente.';

CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_price_change_window
  ON public.recurring_subscriptions (price_change_expires_at)
  WHERE price_change_expires_at IS NOT NULL AND price_change_decision IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Hash canonico dos itens de um plano (unica fonte de verdade)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recurring_plan_items_hash(p_plan_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT md5(COALESCE(string_agg(t.line, E'\n' ORDER BY t.sort_order, t.id), ''))
  FROM (
    SELECT
      i.item_type || '|' || COALESCE(i.product_id::text, '') || '|' ||
      COALESCE(i.variant_id::text, '') || '|' || COALESCE(i.service_id::text, '') || '|' ||
      (i.quantity::double precision)::text || '|' || COALESCE(i.preferred_time::text, '') || '|' ||
      COALESCE(i.duration_minutes::text, '') || '|' ||
      COALESCE(i.staff_partner_user_id::text, '') AS line,
      i.sort_order,
      i.id
    FROM public.recurring_plan_items i
    WHERE i.plan_id = p_plan_id
  ) t;
$$;

COMMENT ON FUNCTION public.recurring_plan_items_hash(UUID) IS
  'md5 da representacao canonica dos itens de um plano (identidade + quantidade, sem preco).';

REVOKE EXECUTE ON FUNCTION public.recurring_plan_items_hash(UUID)
  FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 3) Baseline contratual na criacao da assinatura (trigger de snapshot)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_subscription_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  INSERT INTO public.recurring_subscription_items (
    subscription_id, item_type, product_id, variant_id, service_id,
    quantity, unit_price, staff_partner_user_id, preferred_time,
    duration_minutes, sort_order
  )
  SELECT
    NEW.id,
    rpi.item_type,
    rpi.product_id,
    rpi.variant_id,
    rpi.service_id,
    rpi.quantity,
    public.recurring_plan_item_price(
      rpi.item_type, rpi.product_id, rpi.variant_id, rpi.service_id, rpi.unit_price
    ),
    rpi.staff_partner_user_id,
    rpi.preferred_time,
    rpi.duration_minutes,
    rpi.sort_order
  FROM public.recurring_plan_items rpi
  WHERE rpi.plan_id = NEW.recurring_plan_id;

  UPDATE public.recurring_subscriptions
  SET contracted_amount = ROUND(
        COALESCE((SELECT p.price FROM public.recurring_plans p WHERE p.id = NEW.recurring_plan_id), 0)
        + COALESCE(NEW.shipping_amount, 0), 2),
      contracted_items_hash = public.recurring_plan_items_hash(NEW.recurring_plan_id)
  WHERE id = NEW.id
    AND contracted_amount IS NULL;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Backfill do baseline para assinaturas ja existentes
-- ---------------------------------------------------------------------------
UPDATE public.recurring_subscriptions rs
SET contracted_amount = ROUND(COALESCE(rp.price, 0) + COALESCE(rs.shipping_amount, 0), 2),
    contracted_items_hash = public.recurring_plan_items_hash(rs.recurring_plan_id)
FROM public.recurring_plans rp
WHERE rp.id = rs.recurring_plan_id
  AND rs.contracted_amount IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Deteccao: abre/renova a janela de consentimento de todas as assinaturas
--    elegiveis do plano quando preco ou itens mudaram.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_recurring_plan_price_change(
  p_plan_id UUID,
  p_window_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  subscription_id UUID,
  customer_id UUID,
  old_amount NUMERIC,
  new_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_plan_price NUMERIC(14, 2);
  v_hash TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := NOW() + make_interval(days => GREATEST(COALESCE(p_window_days, 7), 1));
BEGIN
  SELECT rp.price INTO v_plan_price
  FROM public.recurring_plans rp
  WHERE rp.id = p_plan_id;

  IF v_plan_price IS NULL THEN
    RETURN;
  END IF;

  v_hash := public.recurring_plan_items_hash(p_plan_id);

  RETURN QUERY
  UPDATE public.recurring_subscriptions rs
  SET price_change_requested_at = v_now,
      price_change_expires_at = v_expires,
      price_change_decision = NULL
  WHERE rs.recurring_plan_id = p_plan_id
    AND rs.status IN ('active', 'awaiting_customer_decision')
    AND (
      rs.contracted_items_hash IS DISTINCT FROM v_hash
      OR rs.contracted_amount IS DISTINCT FROM ROUND(v_plan_price + COALESCE(rs.shipping_amount, 0), 2)
    )
  RETURNING
    rs.id,
    rs.customer_id,
    rs.contracted_amount,
    ROUND(v_plan_price + COALESCE(rs.shipping_amount, 0), 2);
END;
$$;

COMMENT ON FUNCTION public.mark_recurring_plan_price_change(UUID, INTEGER) IS
  'Abre/renova a janela de consentimento das assinaturas ativas afetadas pela mudanca do plano. Retorna as assinaturas a notificar.';

REVOKE EXECUTE ON FUNCTION public.mark_recurring_plan_price_change(UUID, INTEGER)
  FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 6) Aceite: re-snapshot dos itens, novo baseline e status de volta p/ ativa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_recurring_plan_change(p_subscription_id UUID)
RETURNS TABLE (new_amount NUMERIC, plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_plan_id UUID;
  v_shipping NUMERIC(14, 2);
  v_plan_price NUMERIC(14, 2);
  v_new_amount NUMERIC(14, 2);
  v_hash TEXT;
BEGIN
  SELECT rs.recurring_plan_id, COALESCE(rs.shipping_amount, 0)
  INTO v_plan_id, v_shipping
  FROM public.recurring_subscriptions rs
  WHERE rs.id = p_subscription_id
  FOR UPDATE;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Assinatura % nao encontrada', p_subscription_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recurring_subscriptions rs
    WHERE rs.id = p_subscription_id
      AND (rs.price_change_decision IS NOT NULL OR rs.price_change_expires_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'Assinatura % sem mudanca de preco pendente', p_subscription_id;
  END IF;

  SELECT rp.price INTO v_plan_price
  FROM public.recurring_plans rp
  WHERE rp.id = v_plan_id;

  v_new_amount := ROUND(COALESCE(v_plan_price, 0) + v_shipping, 2);
  v_hash := public.recurring_plan_items_hash(v_plan_id);

  -- Re-snapshot: mesma expressao de preco do trigger de criacao.
  DELETE FROM public.recurring_subscription_items
  WHERE subscription_id = p_subscription_id;

  INSERT INTO public.recurring_subscription_items (
    subscription_id, item_type, product_id, variant_id, service_id,
    quantity, unit_price, staff_partner_user_id, preferred_time,
    duration_minutes, sort_order
  )
  SELECT
    p_subscription_id,
    rpi.item_type,
    rpi.product_id,
    rpi.variant_id,
    rpi.service_id,
    rpi.quantity,
    public.recurring_plan_item_price(
      rpi.item_type, rpi.product_id, rpi.variant_id, rpi.service_id, rpi.unit_price
    ),
    rpi.staff_partner_user_id,
    rpi.preferred_time,
    rpi.duration_minutes,
    rpi.sort_order
  FROM public.recurring_plan_items rpi
  WHERE rpi.plan_id = v_plan_id;

  UPDATE public.recurring_subscriptions rs
  SET contracted_amount = v_new_amount,
      contracted_items_hash = v_hash,
      price_change_decision = 'accepted',
      price_change_requested_at = NULL,
      price_change_expires_at = NULL,
      pending_cancellation_reason = NULL,
      status = CASE WHEN rs.status = 'awaiting_customer_decision' THEN 'active' ELSE rs.status END,
      updated_at = NOW()
  WHERE rs.id = p_subscription_id;

  RETURN QUERY SELECT v_new_amount, v_plan_id;
END;
$$;

COMMENT ON FUNCTION public.apply_recurring_plan_change(UUID) IS
  'Aceite do cliente: re-snapshot dos itens do plano, novo baseline e destravamento da cobranca.';

REVOKE EXECUTE ON FUNCTION public.apply_recurring_plan_change(UUID)
  FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 7) Tipos de notificação do fluxo
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'order_created',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'order_refunded',
    'appointment_created',
    'appointment_confirmed',
    'appointment_reminder',
    'appointment_cancelled',
    'appointment_rescheduled',
    'subscription_created',
    'subscription_renewed',
    'subscription_price_change',
    'subscription_price_change_expired',
    'message_received',
    'admin_announcement',
    'low_stock',
    'replenishment_suggested',
    'service_return_reminder',
    'xml_import_completed',
    'cart_abandoned'
  ));

COMMIT;
