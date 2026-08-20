-- ============================================================================
-- Correção do fluxo de Entregadores Dudit e Ofertas Disponíveis
-- ============================================================================

-- 1. Permitir que delivery_assignments.driver_id seja nulo durante ofertas abertas
ALTER TABLE public.delivery_assignments ALTER COLUMN driver_id DROP NOT NULL;

-- 2. Atualizar a constraint de status em delivery_assignments para suportar 'available' e 'requested'
ALTER TABLE public.delivery_assignments DROP CONSTRAINT IF EXISTS delivery_assignments_status_check;
ALTER TABLE public.delivery_assignments ADD CONSTRAINT delivery_assignments_status_check
  CHECK (status IN ('available', 'requested', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled'));

-- 3. Atualizar o trigger de validação de tenant em delivery_assignments para aceitar driver_id nulo
CREATE OR REPLACE FUNCTION public.validate_delivery_assignment_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_partner uuid;
  delivery_partner uuid;
BEGIN
  SELECT o.partner_id INTO order_partner
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF order_partner IS NULL OR order_partner <> NEW.partner_id THEN
    RAISE EXCEPTION 'delivery_assignment_partner_mismatch';
  END IF;

  IF NEW.delivery_id IS NOT NULL THEN
    SELECT d.partner_id INTO delivery_partner
    FROM public.deliveries d
    WHERE d.id = NEW.delivery_id;

    IF delivery_partner IS NULL OR delivery_partner <> NEW.partner_id THEN
      RAISE EXCEPTION 'delivery_assignment_delivery_mismatch';
    END IF;
  END IF;

  IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.user_id = NEW.driver_id AND dd.is_active = true
  ) THEN
    RAISE EXCEPTION 'delivery_driver_inactive';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.order_id <> OLD.order_id OR
    NEW.partner_id <> OLD.partner_id OR
    (OLD.driver_id IS NOT NULL AND NEW.driver_id <> OLD.driver_id)
  ) THEN
    RAISE EXCEPTION 'delivery_assignment_ownership_immutable';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Atualizar políticas de RLS para que entregadores ativos possam visualizar ofertas disponíveis
DROP POLICY IF EXISTS delivery_assignments_select_own ON public.delivery_assignments;
CREATE POLICY delivery_assignments_select_own
  ON public.delivery_assignments FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR (
      (status IN ('available', 'requested') OR driver_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM public.delivery_drivers dd
        WHERE dd.user_id = auth.uid() AND dd.is_active = true
      )
    )
  );

-- 5. Atualizar função de transição de status de entregas do entregador
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

  -- Regra solicitada:
  -- 'accepted' e 'picked_up' -> pedido NÃO vai para 'sent' (permanece 'preparing')
  -- 'out_for_delivery' -> pedido vai para 'sent'
  -- 'delivered' -> pedido vai para 'delivered'
  -- 'failed' -> pedido vai para 'delivery_failed'
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

  -- 2. Sincronizar tabela deliveries (se existir delivery_id vinculado ou link em delivery_orders)
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
    -- Buscar vínculos existentes na delivery_orders caso delivery_id não estivesse direto na assignment
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

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_STATUS_CHANGED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_status_changed',
    ARRAY['Status alterado para ' || p_next_status],
    jsonb_build_object('order_id', v_assignment.order_id, 'from', v_assignment.status, 'to', p_next_status),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'status', p_next_status,
    'order_delivery_status', v_order_delivery_status
  );
END;
$$;

-- 6. Atualizar get_my_delivery_assignments para retornar nome e dados reais da loja
DROP FUNCTION IF EXISTS public.get_my_delivery_assignments(text, integer, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignments(text, integer, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignments;
CREATE OR REPLACE FUNCTION public.get_my_delivery_assignments(
  p_bucket text DEFAULT 'all',
  p_limit integer DEFAULT 20,
  p_before_assigned_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  assignment_id uuid,
  order_id uuid,
  partner_id uuid,
  status text,
  assigned_at timestamptz,
  completed_at timestamptz,
  delivery_fee numeric,
  failure_reason text,
  order_number text,
  partner_name text,
  store_name text,
  store_phone text,
  store_address text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  total_amount numeric,
  payment_method text,
  payment_status text,
  notes text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    da.id,
    da.order_id,
    da.partner_id,
    da.status,
    da.assigned_at,
    da.completed_at,
    da.delivery_fee,
    da.failure_reason,
    o.order_number,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
    COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
    COALESCE(
      (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = da.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
      ''
    ) AS store_address,
    COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente'),
    COALESCE(c.phone, ''),
    o.delivery_address,
    o.total_amount,
    o.payment_method,
    o.situation,
    da.notes,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', oi.product_name,
        'quantity', oi.quantity
      ) ORDER BY oi.id)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.delivery_assignments da
  JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
  JOIN public.partners p ON p.id = da.partner_id
  LEFT JOIN public.stores s ON s.id = o.store_id
  LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
  WHERE da.driver_id = auth.uid()
    AND (
      p_bucket = 'all' OR
      (p_bucket = 'pending' AND da.status IN ('assigned', 'accepted')) OR
      (p_bucket = 'in_progress' AND da.status IN ('picked_up', 'out_for_delivery')) OR
      (p_bucket = 'completed' AND da.status = 'delivered')
    )
    AND (
      p_before_assigned_at IS NULL OR
      da.assigned_at < p_before_assigned_at OR
      (da.assigned_at = p_before_assigned_at AND da.id < p_before_id)
    )
  ORDER BY da.assigned_at DESC, da.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

-- 7. Atualizar get_my_delivery_assignment para detalhe completo com dados reais da loja
DROP FUNCTION IF EXISTS public.get_my_delivery_assignment(uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignment;
CREATE OR REPLACE FUNCTION public.get_my_delivery_assignment(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(row) FROM (
    SELECT
      da.id AS assignment_id,
      da.order_id,
      da.partner_id,
      da.status,
      da.assigned_at,
      da.accepted_at,
      da.picked_up_at,
      da.out_for_delivery_at,
      da.completed_at,
      da.failed_at,
      da.delivery_fee,
      da.failure_reason,
      da.notes,
      da.payment_confirmed_at,
      o.order_number,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
      COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
      COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
      COALESCE(
        (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = da.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
        ''
      ) AS store_address,
      COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente') AS customer_name,
      COALESCE(c.phone, '') AS customer_phone,
      o.delivery_address,
      o.total_amount,
      o.payment_method,
      o.situation AS payment_status,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity) ORDER BY oi.id)
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    JOIN public.partners p ON p.id = da.partner_id
    LEFT JOIN public.stores s ON s.id = o.store_id
    LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
    WHERE da.id = p_assignment_id AND (da.driver_id = auth.uid() OR (da.status IN ('available', 'requested') AND da.driver_id IS NULL))
  ) row;
$$;

-- 8. Criar RPC get_available_delivery_offers para listar ofertas de entrega para entregadores
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers;
CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(p_limit integer DEFAULT 50)
RETURNS TABLE (
  assignment_id uuid,
  order_id uuid,
  partner_id uuid,
  status text,
  assigned_at timestamptz,
  delivery_fee numeric,
  order_number text,
  partner_name text,
  store_name text,
  store_phone text,
  store_logo_url text,
  store_address text,
  customer_name text,
  customer_phone text,
  delivery_address text,
  total_amount numeric,
  payment_method text,
  notes text,
  items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    da.id,
    da.order_id,
    da.partner_id,
    da.status,
    da.assigned_at,
    da.delivery_fee,
    o.order_number,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
    COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
    COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
    COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
    COALESCE(
      (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = da.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
      ''
    ) AS store_address,
    COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente'),
    COALESCE(c.phone, ''),
    o.delivery_address,
    o.total_amount,
    o.payment_method,
    da.notes,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', oi.product_name,
        'quantity', oi.quantity
      ) ORDER BY oi.id)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.delivery_assignments da
  JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
  JOIN public.partners p ON p.id = da.partner_id
  LEFT JOIN public.stores s ON s.id = o.store_id
  LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
  WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
    AND EXISTS (
      SELECT 1 FROM public.delivery_drivers dd
      WHERE dd.user_id = auth.uid() AND dd.is_active = true
    )
  ORDER BY da.assigned_at DESC, da.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- 9. Criar RPC accept_delivery_offer para o entregador aceitar a entrega de forma atômica
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.user_id = v_user AND dd.is_active = true
  ) THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
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

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_OFFER_ACCEPTED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_offer_accepted',
    ARRAY['Oferta de entrega aceita pelo entregador'],
    jsonb_build_object('order_id', v_assignment.order_id, 'driver_id', v_user),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'status', 'accepted',
    'accepted_at', v_now
  );
END;
$$;
