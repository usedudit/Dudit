-- Migration: Fix delivery_person_id FK violation
-- The RPC accept_delivery_offer was setting delivery_person_id = auth.uid()
-- but the FK references partner_users(id), not auth.users(id).
-- This migration fixes the RPC to look up the correct partner_users.id.

-- 1. Fix accept_delivery_offer: lookup partner_users.id before writing to deliveries
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
  v_delivery public.deliveries%ROWTYPE;
  v_now timestamptz := now();
  v_active_count integer;
  v_driver_city text;
  v_is_active boolean;
  v_partner_user_id uuid;
BEGIN
  -- Verificar se entregador está ativo
  SELECT is_active, city INTO v_is_active, v_driver_city
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  -- Trava de capacidade: Máximo de 2 rotas de entregas simultâneas ativas por entregador
  SELECT count(DISTINCT COALESCE(delivery_id, id)) INTO v_active_count
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

  IF v_assignment.status = 'cancelled' THEN
    RAISE EXCEPTION 'delivery_assignment_cancelled';
  END IF;

  IF v_assignment.driver_id IS NOT NULL AND v_assignment.driver_id <> v_user THEN
    RAISE EXCEPTION 'delivery_assignment_already_accepted';
  END IF;

  IF v_assignment.status NOT IN ('available', 'requested', 'assigned') THEN
    RAISE EXCEPTION 'delivery_assignment_not_available';
  END IF;

  -- Verificar expiração de 15 minutos para ofertas disponíveis
  IF v_assignment.driver_id IS NULL AND v_assignment.assigned_at < (v_now - interval '15 minutes') THEN
    RAISE EXCEPTION 'delivery_offer_expired';
  END IF;

  -- Lookup partner_users.id for this driver (needed for delivery_person_id FK)
  SELECT pu.id INTO v_partner_user_id
  FROM public.partner_users pu
  WHERE pu.user_id = v_user AND pu.partner_id = v_assignment.partner_id
  LIMIT 1;

  -- VALIDAÇÃO CRÍTICA DE ENTREGA PRÓPRIA / EQUIPE OU JÁ DESPACHADA:
  IF v_assignment.delivery_id IS NOT NULL THEN
    SELECT * INTO v_delivery
    FROM public.deliveries
    WHERE id = v_assignment.delivery_id
    FOR UPDATE;

    IF FOUND THEN
      -- Se a entrega já foi finalizada ou cancelada pelo lojista
      IF v_delivery.status IN ('delivered', 'cancelled') THEN
        UPDATE public.delivery_assignments
        SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
        WHERE delivery_id = v_assignment.delivery_id;

        RAISE EXCEPTION 'delivery_already_finished_or_cancelled';
      END IF;

      -- Se o lojista atribuiu um entregador próprio/da equipe (delivery_person_id preenchido diferente deste motorista)
      IF v_delivery.delivery_person_id IS NOT NULL
         AND v_partner_user_id IS NOT NULL
         AND v_delivery.delivery_person_id <> v_partner_user_id THEN
        UPDATE public.delivery_assignments
        SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
        WHERE delivery_id = v_assignment.delivery_id;

        RAISE EXCEPTION 'delivery_already_assigned_to_team_driver';
      END IF;
    END IF;
  END IF;

  -- Verificar se algum pedido desta entrega já foi despachado/entregue/cancelado no ERP
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE (
      (v_assignment.delivery_id IS NOT NULL AND o.id IN (SELECT do_inner.order_id FROM public.delivery_orders do_inner WHERE do_inner.delivery_id = v_assignment.delivery_id))
      OR (v_assignment.delivery_id IS NULL AND o.id = v_assignment.order_id)
    )
    AND o.partner_id = v_assignment.partner_id
    AND o.delivery_status IN ('sent', 'delivered', 'cancelled')
  ) THEN
    UPDATE public.delivery_assignments
    SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    WHERE id = v_assignment.id OR (v_assignment.delivery_id IS NOT NULL AND delivery_id = v_assignment.delivery_id);

    RAISE EXCEPTION 'order_already_dispatched_or_cancelled';
  END IF;

  -- Se pertencer a uma entrega agrupada com múltiplos pedidos, atualiza todos os pedidos da rota
  IF v_assignment.delivery_id IS NOT NULL THEN
    UPDATE public.delivery_assignments
    SET driver_id = v_user,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE delivery_id = v_assignment.delivery_id
      AND (driver_id IS NULL OR driver_id = v_user);

    -- Atualiza status e entregador da tabela deliveries
    -- Use v_partner_user_id (partner_users.id) instead of v_user (auth.uid())
    UPDATE public.deliveries
    SET status = 'preparing',
        delivery_person_id = COALESCE(v_partner_user_id, delivery_person_id)
    WHERE id = v_assignment.delivery_id;

    -- Atualiza status de todos os pedidos da entrega para preparing se pendentes
    UPDATE public.orders
    SET delivery_status = CASE WHEN delivery_status IN ('pending', 'not_sent') THEN 'preparing' ELSE delivery_status END
    WHERE id IN (
      SELECT do_inner.order_id
      FROM public.delivery_orders do_inner
      WHERE do_inner.delivery_id = v_assignment.delivery_id
    ) AND partner_id = v_assignment.partner_id;
  ELSE
    UPDATE public.delivery_assignments
    SET driver_id = v_user,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = v_assignment.id;

    UPDATE public.orders
    SET delivery_status = CASE WHEN delivery_status IN ('pending', 'not_sent') THEN 'preparing' ELSE delivery_status END
    WHERE id = v_assignment.order_id AND partner_id = v_assignment.partner_id;
  END IF;

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_OFFER_ACCEPTED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_offer_accepted',
    ARRAY['Oferta de entrega aceita pelo entregador'],
    jsonb_build_object('order_id', v_assignment.order_id, 'delivery_id', v_assignment.delivery_id, 'driver_id', v_user),
    'delivery_driver_app'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'order_id', v_assignment.order_id,
    'delivery_id', v_assignment.delivery_id,
    'message', 'Oferta aceita com sucesso'
  );
END;
$$;

-- 2. Fix get_available_delivery_offers: compare delivery_person_id against partner_users.id
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(uuid, integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers;

CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN (
    WITH current_driver AS (
      SELECT
        dd.user_id,
        dd.city
      FROM public.delivery_drivers dd
      WHERE dd.user_id = auth.uid() AND dd.is_active = true
    ),
    distinct_offers AS (
      SELECT DISTINCT ON (COALESCE(da.delivery_id, da.id))
        da.id,
        da.id AS assignment_id,
        da.order_id,
        da.delivery_id,
        da.partner_id,
        da.status,
        da.assigned_at,
        da.delivery_fee AS raw_fee,
        da.notes,
        o.order_number,
        o.delivery_address,
        o.total_amount AS raw_amount,
        o.payment_method,
        o.store_id,
        o.buyer_id,
        c.customer_name AS raw_customer_name
      FROM public.delivery_assignments da
      JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
      LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
      CROSS JOIN current_driver cd
      WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
        AND da.assigned_at >= (now() - interval '15 minutes')
        AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
        AND NOT EXISTS (
          SELECT 1 FROM public.deliveries d
          WHERE d.id = da.delivery_id
            AND (
              d.status IN ('sent', 'delivered', 'cancelled')
              OR (
                d.delivery_person_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM public.partner_users pu
                  WHERE pu.id = d.delivery_person_id AND pu.user_id = auth.uid()
                )
              )
            )
        )
        AND (
          cd.city IS NULL
          OR cd.city = ''
          OR EXISTS (
            SELECT 1 FROM public.addresses sa
            WHERE (sa.store_id = o.store_id OR (o.store_id IS NULL AND sa.partner_id = da.partner_id))
              AND LOWER(TRIM(sa.city)) = LOWER(TRIM(cd.city))
          )
          OR (o.delivery_address ILIKE '%' || cd.city || '%')
        )
        AND (
          da.assigned_at < (now() - interval '3 minutes')
          OR EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = da.partner_id)
          OR NOT EXISTS (
            SELECT 1 FROM public.delivery_driver_partners ddp
            WHERE ddp.partner_id = da.partner_id AND ddp.is_active = true
          )
        )
      ORDER BY COALESCE(da.delivery_id, da.id), da.assigned_at DESC, da.id DESC
    )
    SELECT
      dto.id,
      dto.assignment_id,
      dto.order_id,
      dto.delivery_id,
      dto.partner_id,
      dto.status,
      dto.assigned_at,
      COALESCE((
        SELECT SUM(da2.delivery_fee)
        FROM public.delivery_assignments da2
        WHERE da2.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), dto.raw_fee) AS delivery_fee,
      dto.order_number,
      COALESCE((
        SELECT count(*)
        FROM public.delivery_orders do_cnt
        WHERE do_cnt.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ), 1::bigint) AS order_count,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
      COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
      COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
      COALESCE(
        (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = dto.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
        o_primary.delivery_address,
        ''
      ) AS store_address,
      COALESCE(c_primary.full_name, dto.raw_customer_name, 'Cliente') AS customer_name,
      COALESCE(c_primary.phone, '') AS customer_phone,
      COALESCE(
        (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.user_id = dto.buyer_id ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
        o_primary.delivery_address,
        ''
      ) AS customer_address,
      o_primary.total_amount AS order_total,
      o_primary.payment_method,
      (SELECT jsonb_agg(jsonb_build_object(
        'order_id', o_inner.id,
        'order_number', o_inner.order_number,
        'total_amount', o_inner.total_amount,
        'delivery_address', o_inner.delivery_address,
        'customer_name', COALESCE(c_inner.full_name, o_inner.customer_name, 'Cliente')
      ))
      FROM public.delivery_orders do_inner
      JOIN public.orders o_inner ON o_inner.id = do_inner.order_id
      LEFT JOIN public.customers c_inner ON c_inner.id = o_inner.buyer_id AND c_inner.partner_id = o_inner.partner_id
      WHERE do_inner.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
      ) AS linked_orders
    FROM distinct_offers dto
    JOIN public.orders o_primary ON o_primary.id = dto.order_id AND o_primary.partner_id = dto.partner_id
    JOIN public.partners p ON p.id = dto.partner_id
    LEFT JOIN public.stores s ON s.id = o_primary.store_id
    LEFT JOIN public.customers c_primary ON c_primary.id = o_primary.buyer_id AND c_primary.partner_id = o_primary.partner_id
    ORDER BY dto.assigned_at DESC, dto.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  );
END;
$$;

-- 3. Fix transition_delivery_assignment: compare delivery_person_id against partner_users.id
DROP FUNCTION IF EXISTS public.transition_delivery_assignment(uuid, text, text);
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
  v_partner_user_id uuid;
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

  IF v_assignment.status = 'cancelled' THEN
    RAISE EXCEPTION 'delivery_assignment_cancelled';
  END IF;

  -- Lookup partner_users.id for this driver
  SELECT pu.id INTO v_partner_user_id
  FROM public.partner_users pu
  WHERE pu.user_id = v_user AND pu.partner_id = v_assignment.partner_id
  LIMIT 1;

  -- Se a entrega no ERP foi atribuída a outro entregador (equipe/próprio)
  IF v_assignment.delivery_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = v_assignment.delivery_id
        AND d.delivery_person_id IS NOT NULL
        AND v_partner_user_id IS NOT NULL
        AND d.delivery_person_id <> v_partner_user_id
    ) THEN
      UPDATE public.delivery_assignments
      SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
      WHERE delivery_id = v_assignment.delivery_id;

      RAISE EXCEPTION 'delivery_reassigned_to_team_driver';
    END IF;
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

  -- Atualiza o assignment (ou todos do grupo delivery_id)
  IF v_assignment.delivery_id IS NOT NULL THEN
    UPDATE public.delivery_assignments
    SET status = p_next_status,
        accepted_at = CASE WHEN p_next_status = 'accepted' THEN v_now ELSE accepted_at END,
        picked_up_at = CASE WHEN p_next_status = 'picked_up' THEN v_now ELSE picked_up_at END,
        out_for_delivery_at = CASE WHEN p_next_status = 'out_for_delivery' THEN v_now ELSE out_for_delivery_at END,
        completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE completed_at END,
        failed_at = CASE WHEN p_next_status = 'failed' THEN v_now ELSE failed_at END,
        failure_reason = CASE WHEN p_next_status = 'failed' THEN trim(p_failure_reason) ELSE failure_reason END,
        updated_at = v_now
    WHERE delivery_id = v_assignment.delivery_id
      AND driver_id = v_user;

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

    UPDATE public.orders
    SET delivery_status = v_order_delivery_status,
        delivery_departure_at = CASE
          WHEN p_next_status IN ('out_for_delivery', 'delivered')
            THEN COALESCE(delivery_departure_at, v_now)
          ELSE delivery_departure_at
        END,
        delivery_arrived_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_arrived_at END,
        delivery_completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_completed_at END
    WHERE id IN (
      SELECT do_item.order_id FROM public.delivery_orders do_item WHERE do_item.delivery_id = v_assignment.delivery_id
    ) AND partner_id = v_assignment.partner_id;
  ELSE
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
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_STATUS_CHANGED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_status_changed',
    ARRAY['Status alterado para: ' || p_next_status],
    jsonb_build_object(
      'order_id', v_assignment.order_id,
      'delivery_id', v_assignment.delivery_id,
      'from_status', v_assignment.status,
      'to_status', p_next_status,
      'driver_name', v_driver_name,
      'failure_reason', p_failure_reason
    ),
    'delivery_driver_app'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'new_status', p_next_status,
    'message', 'Status atualizado com sucesso'
  );
END;
$$;
