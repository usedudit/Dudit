-- Entregadores Dudit - MVP
--
-- Entregadores são usuários da plataforma, não membros de partner_users.
-- O ERP legado continua usando deliveries/partner_users; este módulo usa
-- delivery_assignments como fonte da relação entre pedido e entregador.

CREATE TABLE IF NOT EXISTS public.delivery_drivers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  city text NOT NULL,
  neighborhood text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('moto', 'carro')),
  availability_status text NOT NULL DEFAULT 'offline'
    CHECK (availability_status IN ('available', 'offline')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_driver_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, partner_id)
);

CREATE TABLE IF NOT EXISTS public.delivery_driver_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  neighborhood text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('moto', 'carro')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_driver_invitations_pending_email_idx
  ON public.delivery_driver_invitations (lower(email))
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS delivery_driver_invitations_token_idx
  ON public.delivery_driver_invitations (token_hash);

CREATE INDEX IF NOT EXISTS delivery_driver_invitations_created_idx
  ON public.delivery_driver_invitations (created_at DESC);

CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.delivery_drivers(user_id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  out_for_delivery_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  failure_reason text,
  payment_confirmed_at timestamptz,
  payment_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_assignments_driver_cursor_idx
  ON public.delivery_assignments (driver_id, assigned_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS delivery_assignments_driver_status_idx
  ON public.delivery_assignments (driver_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS delivery_assignments_partner_status_idx
  ON public.delivery_assignments (partner_id, status, assigned_at DESC);

CREATE INDEX IF NOT EXISTS delivery_assignments_order_idx
  ON public.delivery_assignments (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS delivery_assignments_active_order_idx
  ON public.delivery_assignments (order_id)
  WHERE status IN ('assigned', 'accepted', 'picked_up', 'out_for_delivery');

CREATE OR REPLACE FUNCTION public.delivery_drivers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_drivers_updated_at ON public.delivery_drivers;
CREATE TRIGGER delivery_drivers_updated_at
  BEFORE UPDATE ON public.delivery_drivers
  FOR EACH ROW EXECUTE FUNCTION public.delivery_drivers_set_updated_at();

DROP TRIGGER IF EXISTS delivery_driver_partners_updated_at ON public.delivery_driver_partners;
CREATE TRIGGER delivery_driver_partners_updated_at
  BEFORE UPDATE ON public.delivery_driver_partners
  FOR EACH ROW EXECUTE FUNCTION public.delivery_drivers_set_updated_at();

DROP TRIGGER IF EXISTS delivery_assignments_updated_at ON public.delivery_assignments;
CREATE TRIGGER delivery_assignments_updated_at
  BEFORE UPDATE ON public.delivery_assignments
  FOR EACH ROW EXECUTE FUNCTION public.delivery_drivers_set_updated_at();

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

  IF NOT EXISTS (
    SELECT 1 FROM public.delivery_drivers dd
    WHERE dd.user_id = NEW.driver_id AND dd.is_active = true
  ) THEN
    RAISE EXCEPTION 'delivery_driver_inactive';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.order_id <> OLD.order_id OR
    NEW.partner_id <> OLD.partner_id OR
    NEW.driver_id <> OLD.driver_id
  ) THEN
    RAISE EXCEPTION 'delivery_assignment_ownership_immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_assignment_tenant_guard ON public.delivery_assignments;
CREATE TRIGGER delivery_assignment_tenant_guard
  BEFORE INSERT OR UPDATE ON public.delivery_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_delivery_assignment_tenant();

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_partners FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_driver_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_drivers_select_self ON public.delivery_drivers;
CREATE POLICY delivery_drivers_select_self
  ON public.delivery_drivers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS delivery_drivers_insert_self ON public.delivery_drivers;
CREATE POLICY delivery_drivers_insert_self
  ON public.delivery_drivers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS delivery_drivers_update_self ON public.delivery_drivers;
CREATE POLICY delivery_drivers_update_self
  ON public.delivery_drivers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS delivery_driver_partners_select_self ON public.delivery_driver_partners;
CREATE POLICY delivery_driver_partners_select_self
  ON public.delivery_driver_partners FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS delivery_assignments_select_own ON public.delivery_assignments;
CREATE POLICY delivery_assignments_select_own
  ON public.delivery_assignments FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS delivery_assignments_update_own ON public.delivery_assignments;
CREATE POLICY delivery_assignments_update_own
  ON public.delivery_assignments FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Mutations happen through the server-side admin flow or the RPCs below.
REVOKE ALL ON public.delivery_drivers FROM anon, authenticated;
GRANT SELECT ON public.delivery_drivers TO authenticated;
REVOKE ALL ON public.delivery_driver_partners FROM anon, authenticated;
GRANT SELECT ON public.delivery_driver_partners TO authenticated;
REVOKE ALL ON public.delivery_driver_invitations FROM anon, authenticated;
REVOKE ALL ON public.delivery_assignments FROM anon, authenticated;
GRANT SELECT ON public.delivery_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_delivery_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_availability text;
  v_active boolean;
  v_occupied boolean;
  v_pending integer;
  v_in_progress integer;
  v_completed integer;
BEGIN
  SELECT dd.availability_status, dd.is_active
    INTO v_availability, v_active
  FROM public.delivery_drivers dd
  WHERE dd.user_id = v_user;

  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  SELECT count(*) FILTER (WHERE da.status IN ('assigned', 'accepted')),
         count(*) FILTER (WHERE da.status IN ('picked_up', 'out_for_delivery')),
         count(*) FILTER (WHERE da.status = 'delivered')
    INTO v_pending, v_in_progress, v_completed
  FROM public.delivery_assignments da
  WHERE da.driver_id = v_user;

  v_occupied := v_in_progress > 0 OR v_pending > 0;

  RETURN jsonb_build_object(
    'pending', v_pending,
    'in_progress', v_in_progress,
    'completed', v_completed,
    'availability', CASE WHEN v_occupied THEN 'occupied' ELSE COALESCE(v_availability, 'offline') END
  );
END;
$$;

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
    COALESCE(p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Parceiro'),
    COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente'),
    c.phone,
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
      COALESCE(p.business_info->>'nome_fantasia', p.business_info->>'razao_social', 'Parceiro') AS partner_name,
      COALESCE(NULLIF(o.customer_name, ''), c.name, 'Cliente') AS customer_name,
      c.phone AS customer_phone,
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
    LEFT JOIN public.customers c ON c.id = o.buyer_id AND c.partner_id = o.partner_id
    WHERE da.id = p_assignment_id AND da.driver_id = auth.uid()
  ) row;
$$;

CREATE OR REPLACE FUNCTION public.set_my_delivery_availability(p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('available', 'offline') THEN
    RAISE EXCEPTION 'invalid_delivery_availability';
  END IF;

  UPDATE public.delivery_drivers
  SET availability_status = p_status, updated_at = now()
  WHERE user_id = auth.uid() AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_driver_not_active';
  END IF;

  RETURN p_status;
END;
$$;

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
  v_order_status text;
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

  IF p_next_status = 'accepted' AND v_assignment.status = 'assigned' THEN v_allowed := true; END IF;
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

  v_order_status := CASE p_next_status
    WHEN 'delivered' THEN 'delivered'
    WHEN 'failed' THEN 'delivery_failed'
    ELSE 'sent'
  END;

  UPDATE public.orders
  SET delivery_status = v_order_status,
      delivery_departure_at = CASE
        WHEN p_next_status IN ('picked_up', 'out_for_delivery', 'delivered')
          THEN COALESCE(delivery_departure_at, v_now)
        ELSE delivery_departure_at
      END,
      delivery_arrived_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_arrived_at END,
      delivery_completed_at = CASE WHEN p_next_status = 'delivered' THEN v_now ELSE delivery_completed_at END
  WHERE id = v_assignment.order_id AND partner_id = v_assignment.partner_id;

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
    'id', v_assignment.id,
    'status', p_next_status,
    'completed_at', CASE WHEN p_next_status = 'delivered' THEN v_now ELSE v_assignment.completed_at END,
    'failure_reason', CASE WHEN p_next_status = 'failed' THEN trim(p_failure_reason) ELSE v_assignment.failure_reason END
  );
END;
$$;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = v_assignment.order_id
      AND (
        lower(coalesce(o.payment_method, '')) IN ('cash', 'dinheiro', 'money') OR
        lower(coalesce(o.payment_method, '')) LIKE '%dinheiro%'
      )
  ) THEN
    RAISE EXCEPTION 'delivery_payment_confirmation_not_applicable';
  END IF;

  UPDATE public.delivery_assignments
  SET payment_confirmed_at = COALESCE(payment_confirmed_at, v_now),
      payment_confirmed_by = COALESCE(payment_confirmed_by, v_user),
      updated_at = v_now
  WHERE id = v_assignment.id;

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, partner_id,
    entity_type, entity_id, action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_assignments', 'DELIVERY_PAYMENT_CONFIRMED', v_user, v_user, v_assignment.partner_id,
    'delivery_assignment', v_assignment.id, 'delivery_payment_confirmed',
    ARRAY['Recebimento operacional confirmado'],
    jsonb_build_object('order_id', v_assignment.order_id, 'note', NULLIF(trim(p_note), '')),
    'delivery_driver_portal'
  );

  RETURN jsonb_build_object('confirmed_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_delivery_driver_invitation(
  p_token_hash text,
  p_full_name text,
  p_phone text,
  p_terms_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.delivery_driver_invitations%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'delivery_invitation_auth_required'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_user;

  SELECT * INTO v_inv
  FROM public.delivery_driver_invitations i
  WHERE i.token_hash = p_token_hash
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.locked_at IS NULL
    AND i.expires_at > now()
    AND lower(i.email) = lower(v_email)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'delivery_invitation_invalid'; END IF;

  INSERT INTO public.user_profiles (user_id, full_name, phone)
  VALUES (v_user, COALESCE(NULLIF(trim(p_full_name), ''), v_inv.full_name), NULLIF(trim(p_phone), ''))
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.user_profiles.phone),
    updated_at = now();

  INSERT INTO public.delivery_drivers (
    user_id, city, neighborhood, vehicle_type, availability_status,
    is_active, notes, terms_accepted_at, terms_version
  ) VALUES (
    v_user, v_inv.city, v_inv.neighborhood, v_inv.vehicle_type, 'offline',
    true, v_inv.notes, now(), p_terms_version
  )
  ON CONFLICT (user_id) DO UPDATE SET
    city = EXCLUDED.city,
    neighborhood = EXCLUDED.neighborhood,
    vehicle_type = EXCLUDED.vehicle_type,
    is_active = true,
    terms_accepted_at = EXCLUDED.terms_accepted_at,
    terms_version = EXCLUDED.terms_version,
    updated_at = now();

  UPDATE public.delivery_driver_invitations
  SET used_at = now(), used_by = v_user
  WHERE id = v_inv.id;

  INSERT INTO public.audit_logs (
    table_name, action, user_id, actor_user_id, entity_type, entity_id,
    action_type, change_lines, metadata, source
  ) VALUES (
    'delivery_drivers', 'DELIVERY_DRIVER_ACTIVATED', v_user, v_user,
    'delivery_driver', v_user, 'delivery_driver_invitation_accepted',
    ARRAY['Convite de entregador aceito'],
    jsonb_build_object('invitation_id', v_inv.id), 'delivery_driver_portal'
  );

  RETURN jsonb_build_object('driver_id', v_user);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_delivery_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_delivery_assignments(text, integer, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_delivery_assignment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_delivery_availability(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_delivery_assignment(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_delivery_payment_received(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_delivery_driver_invitation(text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_delivery_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_assignments(text, integer, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_assignment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_delivery_availability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_delivery_assignment(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_delivery_payment_received(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_delivery_driver_invitation(text, text, text, text) TO authenticated;
