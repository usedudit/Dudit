-- ============================================================================
-- Migration: Endereço Completo & Despacho Inteligente de Entregadores Dudit
-- ============================================================================

-- 1. Adicionar colunas de endereço completo e coordenadas na tabela delivery_drivers
ALTER TABLE public.delivery_drivers
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10, 7);

-- 2. Adicionar colunas de endereço completo e coordenadas na tabela delivery_driver_invitations
ALTER TABLE public.delivery_driver_invitations
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10, 7);

-- 3. Atualizar RPC accept_delivery_driver_invitation para gravar o endereço completo
CREATE OR REPLACE FUNCTION public.accept_delivery_driver_invitation(
  p_token_hash text,
  p_terms_version text DEFAULT '2026-08-17-v1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_user_email text;
  v_invite public.delivery_driver_invitations%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'delivery_driver_not_authenticated';
  END IF;

  SELECT lower(email) INTO v_user_email
  FROM auth.users
  WHERE id = v_user;

  SELECT * INTO v_invite
  FROM public.delivery_driver_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_invitation_invalid';
  END IF;

  IF v_invite.used_at IS NOT NULL OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at < v_now THEN
    RAISE EXCEPTION 'delivery_invitation_invalid';
  END IF;

  IF lower(v_invite.email) <> v_user_email THEN
    RAISE EXCEPTION 'delivery_invitation_email_mismatch';
  END IF;

  UPDATE public.delivery_driver_invitations
  SET used_at = v_now,
      used_by = v_user
  WHERE id = v_invite.id;

  INSERT INTO public.delivery_drivers (
    user_id,
    city,
    neighborhood,
    vehicle_type,
    availability_status,
    is_active,
    notes,
    terms_accepted_at,
    terms_version,
    zip_code,
    street,
    number,
    complement,
    state,
    latitude,
    longitude
  ) VALUES (
    v_user,
    v_invite.city,
    v_invite.neighborhood,
    v_invite.vehicle_type,
    'available',
    true,
    v_invite.notes,
    v_now,
    p_terms_version,
    v_invite.zip_code,
    v_invite.street,
    v_invite.number,
    v_invite.complement,
    v_invite.state,
    v_invite.latitude,
    v_invite.longitude
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    neighborhood = EXCLUDED.neighborhood,
    vehicle_type = EXCLUDED.vehicle_type,
    availability_status = 'available',
    is_active = true,
    notes = COALESCE(EXCLUDED.notes, delivery_drivers.notes),
    terms_accepted_at = COALESCE(delivery_drivers.terms_accepted_at, v_now),
    terms_version = COALESCE(delivery_drivers.terms_version, p_terms_version),
    zip_code = COALESCE(EXCLUDED.zip_code, delivery_drivers.zip_code),
    street = COALESCE(EXCLUDED.street, delivery_drivers.street),
    number = COALESCE(EXCLUDED.number, delivery_drivers.number),
    complement = COALESCE(EXCLUDED.complement, delivery_drivers.complement),
    state = COALESCE(EXCLUDED.state, delivery_drivers.state),
    latitude = COALESCE(EXCLUDED.latitude, delivery_drivers.latitude),
    longitude = COALESCE(EXCLUDED.longitude, delivery_drivers.longitude),
    updated_at = v_now;

  INSERT INTO public.user_profiles (
    user_id,
    full_name,
    phone
  ) VALUES (
    v_user,
    v_invite.full_name,
    v_invite.phone
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(user_profiles.full_name, EXCLUDED.full_name),
    phone = COALESCE(user_profiles.phone, EXCLUDED.phone),
    updated_at = v_now;

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_drivers', 'DELIVERY_DRIVER_ACTIVATED', v_user, v_user,
    'delivery_driver', v_user, 'delivery_driver_activated',
    ARRAY['Entregador ativou convite e aceitou os termos'],
    jsonb_build_object('invitation_id', v_invite.id, 'vehicle_type', v_invite.vehicle_type),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object('success', true, 'driver_id', v_user);
END;
$$;

-- 4. Atualizar RPC get_available_delivery_offers com filtro por cidade e prioridade de parceiros
DROP FUNCTION IF EXISTS public.get_available_delivery_offers(integer);
DROP FUNCTION IF EXISTS public.get_available_delivery_offers;

CREATE OR REPLACE FUNCTION public.get_available_delivery_offers(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
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
  )
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
  CROSS JOIN current_driver cd
  WHERE (da.status IN ('available', 'requested') OR (da.status = 'assigned' AND da.driver_id IS NULL))
    -- 1. Filtro regional: Loja na mesma cidade do entregador (ou endereço de entrega na mesma cidade)
    AND (
      cd.city IS NULL
      OR cd.city = ''
      OR EXISTS (
        SELECT 1 FROM public.addresses sa
        WHERE (sa.store_id = s.id OR (s.id IS NULL AND sa.partner_id = da.partner_id))
          AND LOWER(TRIM(sa.city)) = LOWER(TRIM(cd.city))
      )
      OR (o.delivery_address ILIKE '%' || cd.city || '%')
    )
    -- 2. Janela de prioridade: Se a loja tem parceiros vinculados, os primeiros 3 minutos são exclusivos deles
    AND (
      -- Se a oferta tem mais de 3 minutos, já abre para todos da cidade
      da.assigned_at < (now() - interval '3 minutes')
      -- Se o motorista logado é vinculado a esta loja, ele vê imediatamente
      OR EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = da.partner_id)
      -- Se esta loja NÃO possui nenhum parceiro exclusivo vinculado, abre imediatamente
      OR NOT EXISTS (
        SELECT 1 FROM public.delivery_driver_partners ddp
        WHERE ddp.partner_id = da.partner_id AND ddp.is_active = true
      )
    )
  ORDER BY
    -- Prioridade visual para entregas de lojas vinculadas ao motorista
    CASE WHEN EXISTS (SELECT 1 FROM partner_links pl WHERE pl.partner_id = da.partner_id) THEN 0 ELSE 1 END ASC,
    da.assigned_at DESC,
    da.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

-- 5. Atualizar RPC accept_delivery_offer com trava de capacidade (máximo de entregas ativas)
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
