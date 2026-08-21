-- ============================================================================
-- Migration: Auditoria e Histórico de Entregas e Pagamentos de Pedidos
-- ============================================================================

-- 1. Atualizar RPC accept_delivery_offer para registrar log de auditoria no pedido
DROP FUNCTION IF EXISTS public.accept_delivery_offer(uuid);
DROP FUNCTION IF EXISTS public.accept_delivery_offer;

CREATE OR REPLACE FUNCTION public.accept_delivery_offer(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_assignment public.delivery_assignments%ROWTYPE;
  v_now timestamptz := now();
  v_active_count integer;
  v_driver_name text;
  v_is_active boolean;
BEGIN
  -- Verificar se entregador está ativo
  SELECT dd.is_active, COALESCE(up.full_name, 'Entregador Dudit')
  INTO v_is_active, v_driver_name
  FROM public.delivery_drivers dd
  LEFT JOIN public.user_profiles up ON up.user_id = dd.user_id
  WHERE dd.user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  -- Trava de capacidade: Máximo de 2 entregas simultâneas ativas por entregador
  SELECT count(*) INTO v_active_count
  FROM public.delivery_assignments
  WHERE driver_id = v_user
    AND status IN ('accepted', 'picked_up', 'out_for_delivery');

  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'delivery_driver_busy';
  END IF;

  SELECT * INTO v_assignment
  FROM public.delivery_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_assignment_not_found';
  END IF;

  IF v_assignment.driver_id IS NOT NULL AND v_assignment.driver_id <> v_user THEN
    RAISE EXCEPTION 'delivery_assignment_already_accepted';
  END IF;

  IF v_assignment.status NOT IN ('available', 'requested', 'assigned') THEN
    RAISE EXCEPTION 'delivery_assignment_not_available';
  END IF;

  UPDATE public.delivery_assignments
  SET driver_id = v_user,
      status = 'accepted',
      accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_assignment.id;

  -- Ao aceitar a entrega, garante que o pedido esteja em status de preparo
  UPDATE public.orders
  SET delivery_status = CASE WHEN delivery_status IN ('pending', 'not_sent') THEN 'preparing' ELSE delivery_status END
  WHERE id = v_assignment.order_id AND partner_id = v_assignment.partner_id;

  -- Log na auditoria da assignment
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_OFFER_ACCEPTED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_offer_accepted',
    ARRAY['Oferta de entrega aceita pelo entregador ' || v_driver_name],
    jsonb_build_object('order_id', v_assignment.order_id, 'driver_id', v_user),
    'delivery_driver_portal'
  );

  -- Log no histórico do PEDIDO
  IF v_assignment.order_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      table_name, action, user_id, actor_user_id, partner_id,
      entity_type, entity_id, action_type, change_lines, metadata, source
    ) VALUES (
      'orders', 'DELIVERY_DRIVER_ASSIGNED', v_user, v_user, v_assignment.partner_id,
      'order', v_assignment.order_id, 'delivery_driver_assigned',
      ARRAY['Entregador parceiro aceitou a entrega (' || v_driver_name || ')', 'Status de entrega atualizado para Em preparo'],
      jsonb_build_object('assignment_id', v_assignment.id, 'driver_id', v_user, 'driver_name', v_driver_name),
      'delivery_driver_portal'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'order_id', v_assignment.order_id,
    'status', 'accepted',
    'accepted_at', v_now
  );
END;
$$;

-- 2. Atualizar RPC transition_delivery_assignment para registrar log no histórico do pedido
DROP FUNCTION IF EXISTS public.transition_delivery_assignment(uuid, text, text);
DROP FUNCTION IF EXISTS public.transition_delivery_assignment(uuid, text);
DROP FUNCTION IF EXISTS public.transition_delivery_assignment;

CREATE OR REPLACE FUNCTION public.transition_delivery_assignment(
  p_assignment_id uuid,
  p_next_status text,
  p_failure_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_assignment public.delivery_assignments%ROWTYPE;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_order_delivery_status text;
  v_delivery_status text;
  v_driver_name text;
  v_change_line text;
BEGIN
  SELECT * INTO v_assignment
  FROM public.delivery_assignments da
  WHERE da.id = p_assignment_id
    AND da.driver_id = v_user
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.user_id = v_user AND dd.is_active = true
  ) THEN
    RAISE EXCEPTION 'delivery_assignment_not_owned';
  END IF;

  SELECT COALESCE(up.full_name, 'Entregador')
  INTO v_driver_name
  FROM public.user_profiles up
  WHERE up.user_id = v_user;

  IF p_next_status = 'accepted' AND v_assignment.status IN ('assigned', 'available', 'requested') THEN v_allowed := true; END IF;
  IF p_next_status = 'picked_up' AND v_assignment.status = 'accepted' THEN v_allowed := true; END IF;
  IF p_next_status = 'out_for_delivery' AND v_assignment.status = 'picked_up' THEN v_allowed := true; END IF;
  IF p_next_status = 'delivered' AND v_assignment.status = 'out_for_delivery' THEN v_allowed := true; END IF;
  IF p_next_status = 'failed' AND v_assignment.status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery') THEN v_allowed := true; END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'delivery_assignment_invalid_transition';
  END IF;

  IF p_next_status = 'failed' AND NULLIF(trim(COALESCE(p_failure_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'delivery_failure_reason_required';
  END IF;

  UPDATE public.delivery_assignments
  SET status = p_next_status,
      accepted_at = CASE WHEN p_next_status = 'accepted' THEN v_now ELSE accepted_at END,
      picked_up_at = CASE WHEN p_next_status = 'picked_up' THEN v_now ELSE picked_up_at END,
      out_for_delivery_at = CASE WHEN p_next_status = 'out_for_delivery' THEN v_now ELSE out_for_delivery_at END,
      completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE completed_at END,
      failed_at = CASE WHEN p_next_status = 'failed' THEN v_now ELSE failed_at END,
      failure_reason = CASE WHEN p_next_status = 'failed' THEN trim(p_failure_reason) ELSE failure_reason END,
      updated_at = v_now
  WHERE id = v_assignment.id;

  v_order_delivery_status := CASE p_next_status
    WHEN 'out_for_delivery' THEN 'sent'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'delivery_failed'
    ELSE 'preparing'
  END;

  v_delivery_status := CASE p_next_status
    WHEN 'out_for_delivery' THEN 'sent'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'delivery_failed'
    ELSE 'preparing'
  END;

  -- 1. Atualizar pedido
  UPDATE public.orders
  SET delivery_status = v_order_delivery_status,
      delivery_departure_at = CASE
        WHEN p_next_status IN ('out_for_delivery', 'delivered')
          THEN COALESCE(delivery_departure_at, v_now)
        ELSE delivery_departure_at
      END,
      delivery_arrived_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_arrived_at END,
      delivery_completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_completed_at END
  WHERE id = v_assignment.order_id AND partner_id = v_assignment.partner_id;

  -- 2. Sincronizar tabela deliveries
  IF v_assignment.delivery_id IS NOT NULL THEN
    UPDATE public.deliveries
    SET status = v_delivery_status,
        started_at = CASE WHEN p_next_status IN ('out_for_delivery', 'delivered') THEN COALESCE(started_at, v_now) ELSE started_at END,
        departure_time = CASE WHEN p_next_status IN ('out_for_delivery', 'delivered') THEN COALESCE(departure_time, v_now) ELSE departure_time END,
        delivered_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivered_at END,
        completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE completed_at END
    WHERE id = v_assignment.delivery_id AND partner_id = v_assignment.partner_id;

    UPDATE public.delivery_orders
    SET status = v_delivery_status,
        delivered_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivered_at END
    WHERE delivery_id = v_assignment.delivery_id;
  ELSE
    UPDATE public.delivery_orders do_item
    SET status = v_delivery_status,
        delivered_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivered_at END
    WHERE do_item.order_id = v_assignment.order_id;

    UPDATE public.deliveries d
    SET status = v_delivery_status,
        started_at = CASE WHEN p_next_status IN ('out_for_delivery', 'delivered') THEN COALESCE(started_at, v_now) ELSE started_at END,
        departure_time = CASE WHEN p_next_status IN ('out_for_delivery', 'delivered') THEN COALESCE(departure_time, v_now) ELSE departure_time END,
        delivered_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivered_at END,
        completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE completed_at END
    WHERE d.id IN (
      SELECT do2.delivery_id FROM public.delivery_orders do2 WHERE do2.order_id = v_assignment.order_id
    ) AND d.partner_id = v_assignment.partner_id;
  END IF;

  -- Definir mensagem descritiva para o histórico
  v_change_line := CASE p_next_status
    WHEN 'picked_up' THEN 'Entregador retirou o pedido para entrega'
    WHEN 'out_for_delivery' THEN 'Pedido saiu para entrega (Em rota)'
    WHEN 'delivered' THEN 'Pedido entregue ao destinatário com sucesso'
    WHEN 'failed' THEN 'Tentativa de entrega falhou: ' || trim(COALESCE(p_failure_reason, 'Motivo não informado'))
    ELSE 'Status da entrega alterado para ' || p_next_status
  END;

  -- Log na auditoria da assignment
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_STATUS_CHANGED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_status_changed',
    ARRAY[v_change_line],
    jsonb_build_object('order_id', v_assignment.order_id, 'from', v_assignment.status, 'to', p_next_status, 'failure_reason', p_failure_reason),
    'delivery_driver_portal'
  );

  -- Log no histórico do PEDIDO
  IF v_assignment.order_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      table_name, action, user_id, actor_user_id, partner_id,
      entity_type, entity_id, action_type, change_lines, metadata, source
    ) VALUES (
      'orders', 'DELIVERY_STATUS_CHANGED', v_user, v_user, v_assignment.partner_id,
      'order', v_assignment.order_id, 'delivery_' || p_next_status,
      ARRAY[v_change_line],
      jsonb_build_object('assignment_id', v_assignment.id, 'driver_id', v_user, 'status', p_next_status, 'failure_reason', p_failure_reason),
      'delivery_driver_portal'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'order_id', v_assignment.order_id,
    'status', p_next_status,
    'failure_reason', CASE WHEN p_next_status = 'failed' THEN trim(p_failure_reason) ELSE v_assignment.failure_reason END
  );
END;
$$;

-- 3. Atualizar RPC confirm_delivery_payment_received para registrar log no histórico do pedido e atualizar o status de pagamento
CREATE OR REPLACE FUNCTION public.confirm_delivery_payment_received(
  p_assignment_id uuid,
  p_note text DEFAULT NULL
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
  v_order public.orders%ROWTYPE;
  v_note_text text := trim(COALESCE(p_note, ''));
  v_change_text text;
BEGIN
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

  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id = v_assignment.order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_payment_confirmation_not_applicable';
  END IF;

  UPDATE public.delivery_assignments
  SET payment_confirmed_at = COALESCE(payment_confirmed_at, v_now),
      payment_confirmed_by = COALESCE(payment_confirmed_by, v_user),
      updated_at = v_now
  WHERE id = v_assignment.id;

  -- Se o pedido estiver pendente de pagamento, atualiza para Pago
  IF v_order.situation IN ('pending', 'awaiting_payment', 'not_paid') THEN
    UPDATE public.orders
    SET situation = 'paid',
        paid_amount = COALESCE(total_amount, 0),
        updated_at = v_now
    WHERE id = v_order.id;
  END IF;

  v_change_text := 'Pagamento em dinheiro recebido e confirmado pelo entregador';
  IF v_note_text <> '' THEN
    v_change_text := v_change_text || ' (Obs: ' || v_note_text || ')';
  END IF;

  -- Log na auditoria da assignment
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_PAYMENT_CONFIRMED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_payment_confirmed',
    ARRAY[v_change_text],
    jsonb_build_object('order_id', v_assignment.order_id, 'note', NULLIF(v_note_text, '')),
    'delivery_driver_portal'
  );

  -- Log no histórico do PEDIDO
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'orders', 'DELIVERY_PAYMENT_CONFIRMED', v_user, v_user, v_assignment.partner_id,
    'order', v_assignment.order_id, 'delivery_payment_confirmed',
    ARRAY[v_change_text, 'Situação do pagamento atualizada para Pago'],
    jsonb_build_object('assignment_id', v_assignment.id, 'driver_id', v_user, 'note', NULLIF(v_note_text, '')),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object('confirmed_at', v_now, 'order_id', v_assignment.order_id);
END;
$$;
