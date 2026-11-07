-- Migration: 20260926_driver_payment_on_delivery_rpc.sql
-- Descrição:
-- Cria função confirm_driver_payment para que entregadores confirmem recebimento de pagamento
-- com suporte a rotas com múltiplos pedidos (p_order_id), método específico (Pix, Dinheiro, Cartão, etc),
-- parcelas e valor recebido. Atualiza payment_method, paid_amount, situation e payment_breakdown na tabela orders.

DROP FUNCTION IF EXISTS public.confirm_driver_payment(uuid, text, numeric, integer, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.confirm_driver_payment(uuid, text, numeric, integer, uuid, text);
DROP FUNCTION IF EXISTS public.confirm_driver_payment;

CREATE OR REPLACE FUNCTION public.confirm_driver_payment(
  p_assignment_id uuid,
  p_payment_method text,
  p_amount_received numeric DEFAULT NULL,
  p_installments integer DEFAULT 1,
  p_payment_method_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assignment public.delivery_assignments%ROWTYPE;
  v_user uuid := auth.uid();
  v_now timestamptz := now();
  v_target_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_amount_received numeric;
  v_situation text;
  v_order_total numeric;
  v_note_text text := trim(COALESCE(p_note, ''));
  v_payment_method_normalized text := trim(COALESCE(p_payment_method, 'Não informado'));
  v_breakdown jsonb;
BEGIN
  -- 1. Busca a assignment e verifica ownership
  SELECT * INTO v_assignment
  FROM public.delivery_assignments da
  WHERE da.id = p_assignment_id AND da.driver_id = v_user
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.user_id = v_user AND dd.is_active = true
  ) THEN
    RAISE EXCEPTION 'delivery_assignment_not_owned';
  END IF;

  -- 2. Determina o pedido específico (caso seja rota com múltiplos pedidos)
  IF p_order_id IS NOT NULL THEN
    IF p_order_id != v_assignment.order_id THEN
      IF v_assignment.delivery_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.delivery_orders do2
        WHERE do2.delivery_id = v_assignment.delivery_id AND do2.order_id = p_order_id
      ) THEN
        RAISE EXCEPTION 'order_not_in_delivery_assignment';
      END IF;
    END IF;
    v_target_order_id := p_order_id;
  ELSE
    v_target_order_id := v_assignment.order_id;
  END IF;

  -- 3. Busca o pedido específico
  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = v_target_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_payment_confirmation_not_applicable';
  END IF;

  -- 4. Calcula valores
  v_order_total := COALESCE(v_order.total_amount, 0);

  -- Se amount_received for null, assume o total do pedido
  v_amount_received := COALESCE(p_amount_received, v_order_total);

  -- Cap: não pode ultrapassar o total do pedido
  IF v_amount_received > v_order_total THEN
    v_amount_received := v_order_total;
  END IF;

  -- Determina a situação do pagamento
  IF v_amount_received >= v_order_total - 0.01 THEN
    v_situation := 'paid';
  ELSIF v_amount_received > 0.01 THEN
    v_situation := 'partially_paid';
  ELSE
    RAISE EXCEPTION 'invalid_payment_amount';
  END IF;

  -- 5. Preserva ou monta o payment_breakdown
  IF v_order.payment_breakdown IS NOT NULL AND jsonb_typeof(v_order.payment_breakdown) = 'array' AND jsonb_array_length(v_order.payment_breakdown) > 0 THEN
    v_breakdown := v_order.payment_breakdown;
  ELSE
    v_breakdown := jsonb_build_array(
      jsonb_build_object(
        'method', v_payment_method_normalized,
        'amount', v_order_total,
        'effectiveAmount', v_amount_received,
        'amountReceived', v_amount_received,
        'paymentMethodId', p_payment_method_id,
        'installmentNumber', COALESCE(p_installments, 1),
        'adjustmentType', 'none',
        'adjustmentPercent', 0,
        'adjustmentAmount', 0
      )
    );
  END IF;

  -- 6. Atualiza o pedido específico
  UPDATE public.orders
  SET payment_method = COALESCE(NULLIF(v_order.payment_method, ''), v_payment_method_normalized),
      paid_amount = v_amount_received,
      amount_paid = v_amount_received,
      paid_at = CASE WHEN v_situation = 'paid' THEN COALESCE(paid_at, v_now) ELSE paid_at END,
      situation = v_situation,
      payment_breakdown = v_breakdown,
      updated_at = v_now
  WHERE id = v_order.id;

  -- 7. Se não restarem outros pedidos pendentes de pagamento na entrega, marca payment_confirmed_at na assignment
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_orders do3
    JOIN public.orders o3 ON o3.id = do3.order_id
    WHERE do3.delivery_id = v_assignment.delivery_id
      AND o3.situation NOT IN ('paid', 'concluído', 'concluido', 'approved', 'pago')
      AND o3.id != v_order.id
  ) THEN
    UPDATE public.delivery_assignments
    SET payment_confirmed_at = COALESCE(payment_confirmed_at, v_now),
        payment_confirmed_by = COALESCE(payment_confirmed_by, v_user),
        updated_at = v_now
    WHERE id = v_assignment.id;
  END IF;

  -- 8. Log na auditoria da assignment
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DRIVER_PAYMENT_CONFIRMED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'driver_payment_confirmed',
    ARRAY[
      'Pagamento recebido para o pedido: ' || COALESCE(v_order.order_number, v_order.id::text) || ' via ' || v_payment_method_normalized ||
      ' (R$' || v_amount_received || ', ' || COALESCE(p_installments, 1) || 'x)' ||
      CASE WHEN v_note_text <> '' THEN ' (Obs: ' || v_note_text || ')' ELSE '' END
    ],
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'payment_method', v_payment_method_normalized,
      'amount_received', v_amount_received,
      'installments', COALESCE(p_installments, 1),
      'note', NULLIF(v_note_text, ''),
      'driver_id', v_user
    ),
    'delivery_driver_app'
  );

  RETURN jsonb_build_object(
    'confirmed_at', v_now,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'situation', v_situation,
    'amount_received', v_amount_received,
    'payment_method', v_payment_method_normalized
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_driver_payment(uuid, text, numeric, integer, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_driver_payment(uuid, text, numeric, integer, uuid, text, uuid) TO authenticated;

-- Índice para performance do lookup de assignments por driver
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver_payment ON public.delivery_assignments(driver_id, id, order_id);
