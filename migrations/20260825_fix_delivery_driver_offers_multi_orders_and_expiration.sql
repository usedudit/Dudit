-- Migração para correção do fluxo de entregas, RLS delete, expiração de 15min e suporte a múltiplos pedidos

-- 1. Adicionar política de DELETE para delivery_orders caso não exista
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_orders' AND policyname = 'delivery_orders_delete_partner_users'
  ) THEN
    CREATE POLICY delivery_orders_delete_partner_users
      ON public.delivery_orders
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1
          FROM public.deliveries d
          WHERE d.id = delivery_orders.delivery_id
            AND d.partner_id IN (
              SELECT pu.partner_id
              FROM public.partner_users pu
              WHERE pu.user_id = auth.uid()
            )
        )
      );
  END IF;
END $$;

-- 2. Atualizar RPC get_available_delivery_offers com:
--    - Retorno explícito de id e assignment_id
--    - Expiração de 15 minutos (da.assigned_at >= now() - interval '15 minutes')
--    - Suporte a contagem de pedidos na mesma entrega agrupada (order_count)
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers;

CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  assignment_id uuid,
  order_id uuid,
  delivery_id uuid,
  partner_id uuid,
  status text,
  assigned_at timestamptz,
  delivery_fee numeric,
  order_number text,
  order_count bigint,
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
  WITH current_driver AS (
    SELECT user_id, city, neighborhood, is_active
    FROM public.delivery_drivers
    WHERE user_id = auth.uid() AND is_active = true
    LIMIT 1
  ),
  partner_links AS (
    SELECT partner_id
    FROM public.delivery_driver_partners
    WHERE driver_id = auth.uid() AND is_active = true
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
      o.customer_name AS raw_customer_name
    FROM public.delivery_assignments da
    JOIN public.orders o ON o.id = da.order_id AND o.partner_id = da.partner_id
    CROSS JOIN current_driver cd
    WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
      AND da.assigned_at >= (now() - interval '15 minutes')
      -- Pedido não pode já ter sido enviado, entregue ou cancelado no ERP
      AND o.delivery_status NOT IN ('sent', 'delivered', 'cancelled')
      -- Se houver registro em deliveries, não pode ter sido cancelado, entregue ou atribuído a outro entregador da equipe
      AND NOT EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = da.delivery_id
          AND (
            d.status IN ('sent', 'delivered', 'cancelled')
            OR (d.delivery_person_id IS NOT NULL AND d.delivery_person_id <> auth.uid())
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
      ''
    ) AS store_address,
    COALESCE(NULLIF(dto.raw_customer_name, ''), c.name, 'Cliente') AS customer_name,
    COALESCE(c.phone, '') AS customer_phone,
    dto.delivery_address,
    COALESCE((
      SELECT SUM(o2.total_amount)
      FROM public.delivery_orders do_sum
      JOIN public.orders o2 ON o2.id = do_sum.order_id
      WHERE do_sum.delivery_id = dto.delivery_id AND dto.delivery_id IS NOT NULL
    ), dto.raw_amount) AS total_amount,
    dto.payment_method,
    dto.notes,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'name', oi.product_name,
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'price', oi.product_price,
        'product_price', oi.product_price,
        'unit_price', oi.product_price,
        'subtotal', COALESCE(oi.subtotal, oi.product_price * oi.quantity),
        'sku', COALESCE(pv.sku, pr.sku, 'N/A'),
        'images', pr.images,
        'image_url', pr.images,
        'unit', COALESCE(pr.unit, 'un')
      ) ORDER BY oi.id)
      FROM public.order_items oi
      LEFT JOIN public.products pr ON pr.id = oi.product_id
      LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
      WHERE (dto.delivery_id IS NOT NULL AND oi.order_id IN (SELECT do_i.order_id FROM public.delivery_orders do_i WHERE do_i.delivery_id = dto.delivery_id))
         OR (dto.delivery_id IS NULL AND oi.order_id = dto.order_id)
    ), '[]'::jsonb) AS items
  FROM distinct_offers dto
  JOIN public.partners p ON p.id = dto.partner_id
  LEFT JOIN public.stores s ON s.id = dto.store_id
  LEFT JOIN public.customers c ON c.id = dto.buyer_id AND c.partner_id = dto.partner_id
  ORDER BY
    CASE WHEN EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = dto.partner_id) THEN 0 ELSE 1 END ASC,
    dto.assigned_at DESC,
    dto.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- 3. Atualizar RPC accept_delivery_offer:
--    - Aceita todos os pedidos vinculados ao mesmo delivery_id de forma atômica
--    - Bloqueia ofertas expiradas (> 15 minutos)
--    - Trava de capacidade de no máximo 2 entregas simultâneas
--    - Validação de entrega própria / equipe / cancelada no ERP
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
BEGIN
  -- Verificar se entregador está ativo
  SELECT is_active, city INTO v_is_active, v_driver_city
  FROM public.delivery_drivers
  WHERE user_id = v_user;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  -- Trava de capacidade: Máximo de 2 rotas de entregas simultâneas ativas por entregador
  -- Agrupa por COALESCE(delivery_id, id) para contar rotas agrupadas como 1 entrega ativa
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

  -- VALIDAÇÃO CRÍTICA DE ENTREGA PRÓPRIA / EQUIPE OU JÁ DESPACHADA:
  -- Se houver entrega no ERP (tabela deliveries), verificar se já foi atribuída a entregador próprio ou finalizada
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
      IF v_delivery.delivery_person_id IS NOT NULL AND v_delivery.delivery_person_id <> v_user THEN
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
    UPDATE public.deliveries
    SET status = 'preparing',
        delivery_person_id = v_user
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
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'delivery_id', v_assignment.delivery_id,
    'status', 'accepted',
    'accepted_at', v_now
  );
END;
$$;

-- 4. Atualizar RPC get_my_delivery_assignment:
--    - Permite visualização se atribuído ao motorista OU se estiver disponível (para tela de detalhes antes de aceitar)
--    - Retorna array de pedidos 'orders' para dar suporte completo a rotas com múltiplos pedidos
DROP FUNCTION IF EXISTS public.get_my_delivery_assignment(uuid);
DROP FUNCTION IF EXISTS public.get_my_delivery_assignment;

CREATE OR REPLACE FUNCTION public.get_my_delivery_assignment(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH target_assignment AS (
    SELECT *
    FROM public.delivery_assignments
    WHERE id = p_assignment_id
      AND (
        driver_id = auth.uid()
        OR (status IN ('available', 'requested') AND driver_id IS NULL)
        OR (status = 'assigned' AND driver_id IS NULL)
      )
    LIMIT 1
  ),
  related_orders AS (
    SELECT
      o.id AS order_id,
      o.order_number,
      COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente') AS customer_name,
      COALESCE(c.phone, '') AS customer_phone,
      o.delivery_address,
      o.total_amount,
      o.payment_method,
      o.situation AS payment_status,
      o.delivery_fee,
      COALESCE(do_item.position, 1) AS position,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'name', oi.product_name,
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'price', oi.product_price,
          'product_price', oi.product_price,
          'unit_price', oi.product_price,
          'subtotal', COALESCE(oi.subtotal, oi.product_price * oi.quantity),
          'sku', COALESCE(pv.sku, pr.sku, 'N/A'),
          'images', pr.images,
          'image_url', pr.images,
          'unit', COALESCE(pr.unit, 'un')
        ) ORDER BY oi.id)
        FROM public.order_items oi
        LEFT JOIN public.products pr ON pr.id = oi.product_id
        LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
        WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items
    FROM target_assignment ta
    JOIN public.orders o ON (
      (ta.delivery_id IS NOT NULL AND o.id IN (SELECT do_inner.order_id FROM public.delivery_orders do_inner WHERE do_inner.delivery_id = ta.delivery_id))
      OR (ta.delivery_id IS NULL AND o.id = ta.order_id)
    )
    LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
    LEFT JOIN public.delivery_orders do_item ON do_item.delivery_id = ta.delivery_id AND do_item.order_id = o.id
    ORDER BY COALESCE(do_item.position, 1) ASC, o.created_at ASC
  )
  SELECT to_jsonb(row) FROM (
    SELECT
      ta.id AS assignment_id,
      ta.id,
      ta.delivery_id,
      ta.order_id,
      ta.partner_id,
      ta.status,
      ta.assigned_at,
      ta.accepted_at,
      ta.picked_up_at,
      ta.out_for_delivery_at,
      ta.completed_at,
      ta.failed_at,
      -- Soma as taxas se houver múltiplos pedidos agrupados
      COALESCE((
        SELECT SUM(da_sub.delivery_fee)
        FROM public.delivery_assignments da_sub
        WHERE (ta.delivery_id IS NOT NULL AND da_sub.delivery_id = ta.delivery_id) OR da_sub.id = ta.id
      ), ta.delivery_fee) AS delivery_fee,
      ta.failure_reason,
      ta.notes,
      ta.payment_confirmed_at,
      o_primary.order_number,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS partner_name,
      COALESCE(s.name, p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Loja') AS store_name,
      COALESCE(s.phone, s.business_info->>'whatsapp', p.business_info->>'telefone', p.business_info->>'whatsapp', '') AS store_phone,
      COALESCE(s.logo_url, s.banner_url, '') AS store_logo_url,
      COALESCE(
        (SELECT a.street || ', ' || COALESCE(a.number, 'S/N') || ' - ' || COALESCE(a.neighborhood, '') || ', ' || a.city FROM public.addresses a WHERE a.store_id = s.id OR (s.id IS NULL AND a.partner_id = ta.partner_id) ORDER BY a.is_default DESC NULLS LAST, a.created_at ASC LIMIT 1),
        ''
      ) AS store_address,
      COALESCE(NULLIF(o_primary.customer_name, ''), c_primary.name, 'Cliente') AS customer_name,
      COALESCE(c_primary.phone, '') AS customer_phone,
      o_primary.delivery_address,
      COALESCE((SELECT SUM(ro.total_amount) FROM related_orders ro), o_primary.total_amount) AS total_amount,
      o_primary.payment_method,
      o_primary.situation AS payment_status,
      -- Itens do pedido principal (retrocompatibilidade)
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'name', oi.product_name,
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'price', oi.product_price,
          'product_price', oi.product_price,
          'unit_price', oi.product_price,
          'subtotal', COALESCE(oi.subtotal, oi.product_price * oi.quantity),
          'sku', COALESCE(pv.sku, pr.sku, 'N/A'),
          'images', pr.images,
          'image_url', pr.images,
          'unit', COALESCE(pr.unit, 'un')
        ) ORDER BY oi.id)
        FROM public.order_items oi
        LEFT JOIN public.products pr ON pr.id = oi.product_id
        LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
        WHERE oi.order_id = o_primary.id
      ), '[]'::jsonb) AS items,
      -- Lista completa de pedidos / paradas na rota
      COALESCE((SELECT jsonb_agg(to_jsonb(ro)) FROM related_orders ro), '[]'::jsonb) AS orders,
      COALESCE((SELECT count(*) FROM related_orders), 1::bigint) AS total_orders
    FROM target_assignment ta
    JOIN public.orders o_primary ON o_primary.id = ta.order_id AND o_primary.partner_id = ta.partner_id
    JOIN public.partners p ON p.id = ta.partner_id
    LEFT JOIN public.stores s ON s.id = o_primary.store_id
    LEFT JOIN public.customers c_primary ON c_primary.id = o_primary.buyer_id AND c_primary.partner_id = o_primary.partner_id
  ) row;
$$;

-- 5. Atualizar RPC transition_delivery_assignment:
--    - Sincroniza todos os pedidos vinculados ao delivery_id quando for uma entrega agrupada
--    - Valida se a entrega não foi cancelada ou reatribuída no ERP
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

  -- Se a entrega no ERP foi atribuída a outro entregador (equipe/próprio)
  IF v_assignment.delivery_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = v_assignment.delivery_id
        AND d.delivery_person_id IS NOT NULL
        AND d.delivery_person_id <> v_user
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

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_STATUS_CHANGED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_status_changed',
    ARRAY['Status de entrega atualizado para ' || p_next_status],
    jsonb_build_object(
      'order_id', v_assignment.order_id,
      'delivery_id', v_assignment.delivery_id,
      'driver_id', v_user,
      'status', p_next_status,
      'failure_reason', p_failure_reason
    ),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment.id,
    'delivery_id', v_assignment.delivery_id,
    'status', p_next_status,
    'updated_at', v_now
  );
END;
$$;
