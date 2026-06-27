-- ============================================================================
-- Return policies, eligibility, SLA, Dudit reports, risk score & marketplace
-- Reuses: return_requests, reports, partner_risk_events, suspicious_activities,
--         admin_audit_logs, search_marketplace ranking
-- ============================================================================

BEGIN;

-- ─── 1. Partner return policies (configurable per partner) ─────────────────

CREATE TABLE IF NOT EXISTS public.partner_return_policies (
  partner_id UUID PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  -- Legal reference (informational only - never blocks eligibility)
  legal_online_regret_days INTEGER NOT NULL DEFAULT 7 CHECK (legal_online_regret_days >= 0),
  legal_durable_product_days INTEGER NOT NULL DEFAULT 90 CHECK (legal_durable_product_days >= 0),
  legal_non_durable_product_days INTEGER NOT NULL DEFAULT 30 CHECK (legal_non_durable_product_days >= 0),
  -- Commercial policy
  accepts_size_exchange BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_color_exchange BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_store_credit BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_in_person_return BOOLEAN NOT NULL DEFAULT TRUE,
  accepts_shipping_return BOOLEAN NOT NULL DEFAULT TRUE,
  shipping_payer TEXT NOT NULL DEFAULT 'case_by_case'
    CHECK (shipping_payer IN ('customer', 'seller', 'case_by_case')),
  commercial_deadline_days INTEGER NOT NULL DEFAULT 30 CHECK (commercial_deadline_days >= 0),
  additional_warranty_days INTEGER NOT NULL DEFAULT 0 CHECK (additional_warranty_days >= 0),
  commercial_notes TEXT NULL,
  full_policy_text TEXT NOT NULL DEFAULT '',
  receipt_message TEXT NULL,
  receipt_show_policy_block BOOLEAN NOT NULL DEFAULT TRUE,
  sla_response_days INTEGER NOT NULL DEFAULT 5 CHECK (sla_response_days >= 1 AND sla_response_days <= 90),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.partner_return_policies IS
  'Configurable return/exchange policy per partner. Legal fields are informational only.';

-- ─── 2. Order policy snapshot (frozen at sale time) ──────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_policy_snapshot JSONB NULL;

COMMENT ON COLUMN public.orders.return_policy_snapshot IS
  'Immutable snapshot of partner return policy at the moment the order was paid.';

-- ─── 3. Extend return_requests ─────────────────────────────────────────────

ALTER TABLE public.return_requests
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS eligibility_status TEXT NULL
    CHECK (eligibility_status IS NULL OR eligibility_status IN (
      'elegivel', 'elegivel_comercial', 'elegivel_garantia', 'expirado', 'analise_manual'
    )),
  ADD COLUMN IF NOT EXISTS eligibility_details JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sla_status TEXT NULL
    CHECK (sla_status IS NULL OR sla_status IN ('aguardando_vendedor', 'respondido', 'vencido')),
  ADD COLUMN IF NOT EXISTS sla_expired_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS dudit_report_id UUID NULL REFERENCES public.reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_to_dudit_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_return_requests_sla_due
  ON public.return_requests (sla_due_at)
  WHERE sla_status = 'aguardando_vendedor' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_return_requests_eligibility
  ON public.return_requests (partner_id, eligibility_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_return_requests_dudit_report
  ON public.return_requests (dudit_report_id)
  WHERE dudit_report_id IS NOT NULL;

-- ─── 4. Return messages (customer ↔ seller thread) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.return_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  sender_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'seller', 'system', 'admin')),
  message TEXT NOT NULL CHECK (char_length(message) >= 1 AND char_length(message) <= 2000),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.return_messages IS
  'Thread texto cliente↔vendedor. Anexos usam return_evidence (não esta tabela). metadata pode referenciar evidence_id.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_return_messages_idempotency
  ON public.return_messages (return_request_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_return_messages_request_created
  ON public.return_messages (return_request_id, created_at ASC);

-- ─── 5. Extend reports target_type for return_request ────────────────────────

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('product', 'partner', 'review', 'service', 'return_request'));

-- ─── 6. Default policy template helper ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.default_return_policy_text(p_store_name TEXT DEFAULT 'nossa loja')
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format(
    E'Política de Trocas e Devoluções - %s\n\n'
    || E'1. Prazo comercial: consulte o prazo informado no momento da compra.\n'
    || E'2. Trocas por tamanho ou cor: conforme disponibilidade de estoque.\n'
    || E'3. Devoluções: produto deve estar em condições de revenda, com embalagem e acessórios.\n'
    || E'4. Vale-compra: pode ser oferecido como alternativa ao reembolso.\n'
    || E'5. Frete de devolução: conforme acordado entre cliente e loja.\n\n'
    || E'Referência legal (CDC): arrependimento em compras online em até 7 dias; '
    || E'produtos duráveis até 90 dias; não duráveis até 30 dias para vícios.\n\n'
    || E'A Dudit não participa da transação nem realiza mediação jurídica.',
    COALESCE(NULLIF(TRIM(p_store_name), ''), 'nossa loja')
  );
$$;

-- ─── 7. Build policy snapshot JSONB ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.build_return_policy_snapshot(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.partner_return_policies%ROWTYPE;
  v_store_name TEXT;
BEGIN
  SELECT store_name INTO v_store_name FROM public.partners WHERE id = p_partner_id;

  SELECT * INTO v_policy
  FROM public.partner_return_policies
  WHERE partner_id = p_partner_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'version', 1,
      'captured_at', NOW(),
      'partner_id', p_partner_id,
      'store_name', v_store_name,
      'legal_reference', jsonb_build_object(
        'online_regret_days', 7,
        'durable_product_days', 90,
        'non_durable_product_days', 30
      ),
      'commercial', jsonb_build_object(
        'accepts_size_exchange', TRUE,
        'accepts_color_exchange', TRUE,
        'accepts_store_credit', TRUE,
        'accepts_in_person_return', TRUE,
        'accepts_shipping_return', TRUE,
        'shipping_payer', 'case_by_case',
        'commercial_deadline_days', 30,
        'additional_warranty_days', 0,
        'notes', NULL
      ),
      'full_policy_text', public.default_return_policy_text(v_store_name),
      'receipt_message', NULL,
      'receipt_show_policy_block', TRUE,
      'sla_response_days', 5
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'captured_at', NOW(),
    'partner_id', p_partner_id,
    'store_name', v_store_name,
    'legal_reference', jsonb_build_object(
      'online_regret_days', v_policy.legal_online_regret_days,
      'durable_product_days', v_policy.legal_durable_product_days,
      'non_durable_product_days', v_policy.legal_non_durable_product_days
    ),
    'commercial', jsonb_build_object(
      'accepts_size_exchange', v_policy.accepts_size_exchange,
      'accepts_color_exchange', v_policy.accepts_color_exchange,
      'accepts_store_credit', v_policy.accepts_store_credit,
      'accepts_in_person_return', v_policy.accepts_in_person_return,
      'accepts_shipping_return', v_policy.accepts_shipping_return,
      'shipping_payer', v_policy.shipping_payer,
      'commercial_deadline_days', v_policy.commercial_deadline_days,
      'additional_warranty_days', v_policy.additional_warranty_days,
      'notes', v_policy.commercial_notes
    ),
    'full_policy_text', COALESCE(NULLIF(TRIM(v_policy.full_policy_text), ''), public.default_return_policy_text(v_store_name)),
    'receipt_message', v_policy.receipt_message,
    'receipt_show_policy_block', v_policy.receipt_show_policy_block,
    'sla_response_days', v_policy.sla_response_days
  );
END;
$$;

-- ─── 8. Eligibility calculator ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_return_eligibility(
  p_order_id UUID,
  p_request_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_policy JSONB;
  v_sale_at TIMESTAMPTZ;
  v_days_elapsed INTEGER;
  v_commercial_days INTEGER;
  v_warranty_days INTEGER;
  v_regret_days INTEGER;
  v_status TEXT;
  v_details JSONB;
BEGIN
  SELECT o.id, o.partner_id, o.created_at, o.return_policy_snapshot, o.order_source
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  v_policy := COALESCE(v_order.return_policy_snapshot, public.build_return_policy_snapshot(v_order.partner_id));
  v_sale_at := COALESCE(v_order.created_at, p_request_at);
  v_days_elapsed := GREATEST(0, (DATE(p_request_at AT TIME ZONE 'America/Sao_Paulo')
    - DATE(v_sale_at AT TIME ZONE 'America/Sao_Paulo'))::INTEGER);

  v_commercial_days := COALESCE((v_policy->'commercial'->>'commercial_deadline_days')::INTEGER, 30);
  v_warranty_days := COALESCE((v_policy->'commercial'->>'additional_warranty_days')::INTEGER, 0);
  v_regret_days := COALESCE((v_policy->'legal_reference'->>'online_regret_days')::INTEGER, 7);

  v_details := jsonb_build_object(
    'days_elapsed', v_days_elapsed,
    'commercial_deadline_days', v_commercial_days,
    'additional_warranty_days', v_warranty_days,
    'legal_regret_days', v_regret_days,
    'within_commercial', v_days_elapsed <= v_commercial_days,
    'within_warranty', v_warranty_days > 0 AND v_days_elapsed <= (v_commercial_days + v_warranty_days),
    'within_regret', LOWER(COALESCE(v_order.order_source, '')) LIKE '%marketplace%'
      AND v_days_elapsed <= v_regret_days,
    'policy_snapshot', v_policy,
    'computed_at', p_request_at
  );

  IF v_days_elapsed <= v_regret_days
     AND LOWER(COALESCE(v_order.order_source, '')) LIKE '%marketplace%' THEN
    v_status := 'elegivel';
  ELSIF v_days_elapsed <= v_commercial_days THEN
    v_status := 'elegivel_comercial';
  ELSIF v_warranty_days > 0 AND v_days_elapsed <= (v_commercial_days + v_warranty_days) THEN
    v_status := 'elegivel_garantia';
  ELSIF v_days_elapsed > v_commercial_days AND (v_warranty_days = 0 OR v_days_elapsed > v_commercial_days + v_warranty_days) THEN
    v_status := 'expirado';
  ELSE
    v_status := 'analise_manual';
  END IF;

  RETURN jsonb_build_object('status', v_status, 'details', v_details);
END;
$$;

-- ─── 9. Snapshot policy when order is paid ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.orders_snapshot_return_policy_on_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(COALESCE(NEW.situation, '')) IN ('paid', 'approved')
     AND LOWER(COALESCE(OLD.situation, '')) NOT IN ('paid', 'approved')
     AND NEW.return_policy_snapshot IS NULL THEN
    NEW.return_policy_snapshot := public.build_return_policy_snapshot(NEW.partner_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_snapshot_return_policy ON public.orders;
CREATE TRIGGER trg_orders_snapshot_return_policy
  BEFORE UPDATE OF situation ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_snapshot_return_policy_on_paid();

-- Backfill snapshots: NÃO executado automaticamente nesta migration.
-- Rode manualmente em produção após revisar o preview (seção 9 no doc de revisão).
-- Preview:
--   SELECT COUNT(*) FROM public.orders o
--   WHERE o.return_policy_snapshot IS NULL
--     AND LOWER(COALESCE(o.situation, '')) IN ('paid', 'approved', 'partially_paid')
--     AND o.created_at > NOW() - INTERVAL '365 days';

-- ─── 10. Partner risk score RPC (missing from prior migrations) ─────────────

CREATE OR REPLACE FUNCTION public.increment_partner_risk_score(
  p_partner_id UUID,
  p_points INTEGER,
  p_source_type TEXT DEFAULT 'manual',
  p_source_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted UUID;
  v_new_score INTEGER;
  v_applied INTEGER := 0;
BEGIN
  IF p_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner_required';
  END IF;
  IF p_points IS NULL OR p_points < 0 OR p_points > 50 THEN
    RAISE EXCEPTION 'invalid_points';
  END IF;

  IF p_source_id IS NOT NULL AND p_source_type IS NOT NULL THEN
    INSERT INTO public.partner_risk_events
      (partner_id, source_type, source_id, points, admin_user_id, metadata)
    VALUES
      (p_partner_id, p_source_type, p_source_id, p_points, p_admin_user_id, COALESCE(p_metadata, '{}'::JSONB))
    ON CONFLICT (source_type, source_id) WHERE reverted_at IS NULL DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN
      SELECT risk_score INTO v_new_score FROM public.partners WHERE id = p_partner_id;
      RETURN jsonb_build_object('applied', 0, 'idempotent', true, 'risk_score', COALESCE(v_new_score, 0));
    END IF;
    v_applied := p_points;
  ELSE
    v_applied := p_points;
  END IF;

  UPDATE public.partners
  SET risk_score = LEAST(100, GREATEST(0, COALESCE(risk_score, 0) + v_applied))
  WHERE id = p_partner_id
  RETURNING risk_score INTO v_new_score;

  RETURN jsonb_build_object(
    'applied', v_applied,
    'idempotent', false,
    'risk_score', COALESCE(v_new_score, 0),
    'partner_id', p_partner_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_partner_risk_score(UUID, INTEGER, TEXT, UUID, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_partner_risk_score(UUID, INTEGER, TEXT, UUID, JSONB, UUID) TO service_role;

-- ─── 11. Return-specific risk rules ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_return_partner_risk(
  p_partner_id UUID,
  p_source_type TEXT,
  p_source_id UUID,
  p_points INTEGER,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.increment_partner_risk_score(
    p_partner_id, p_points, p_source_type, p_source_id, p_metadata, NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_return_rejection_risk(p_partner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recusas NÃO alteram risk_score automaticamente.
  -- Evidência fica em return_requests + return_events; pontuação só via admin (validate_report / moderação).
  RETURN;
END;
$$;

-- ─── 12. SLA expiry batch job ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_return_sla_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Apenas solicitações ainda aguardando vendedor entram no cron.
  -- sla_status = respondido | vencido são ignoradas.
  FOR v_row IN
    SELECT id, partner_id
    FROM public.return_requests
    WHERE deleted_at IS NULL
      AND sla_status = 'aguardando_vendedor'
      AND sla_due_at IS NOT NULL
      AND sla_due_at < NOW()
      AND status IN ('PENDING_REVIEW', 'UNDER_ANALYSIS', 'WAITING_CUSTOMER')
  LOOP
    UPDATE public.return_requests
    SET sla_status = 'vencido',
        sla_expired_at = NOW(),
        updated_at = NOW()
    WHERE id = v_row.id
      AND sla_status = 'aguardando_vendedor';

    IF FOUND THEN
      INSERT INTO public.return_events (
        return_request_id, partner_id, event_type, message, metadata, source
      ) VALUES (
        v_row.id, v_row.partner_id, 'sla_expired',
        'Prazo interno de resposta do vendedor expirado',
        jsonb_build_object('auto', true),
        'system'
      );

      PERFORM public.apply_return_partner_risk(
        v_row.partner_id, 'return_sla_expired', v_row.id, 1,
        jsonb_build_object('return_request_id', v_row.id)
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ─── 13. Resolve report partner for return_request ───────────────────────────

CREATE OR REPLACE FUNCTION public._resolve_report_partner(
  p_target_type TEXT,
  p_target_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
BEGIN
  IF p_target_type = 'partner' THEN
    SELECT id INTO pid FROM public.partners WHERE id = p_target_id;
  ELSIF p_target_type = 'product' THEN
    SELECT partner_id INTO pid FROM public.products WHERE id = p_target_id;
  ELSIF p_target_type = 'service' THEN
    SELECT partner_id INTO pid FROM public.services WHERE id = p_target_id;
  ELSIF p_target_type = 'review' THEN
    SELECT partner_id INTO pid FROM public.reviews WHERE id = p_target_id;
  ELSIF p_target_type = 'return_request' THEN
    SELECT partner_id INTO pid FROM public.return_requests WHERE id = p_target_id;
  END IF;
  RETURN pid;
END;
$$;

-- ─── 14. Report return to Dudit (RPC) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.report_return_to_dudit(
  p_return_request_id UUID,
  p_reporter_user_id UUID,
  p_reason_code TEXT,
  p_description TEXT,
  p_legal_ack BOOLEAN,
  p_idempotency_key TEXT DEFAULT NULL,
  p_ip_hash TEXT DEFAULT NULL,
  p_ua_hash TEXT DEFAULT NULL,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_report_id UUID;
  v_existing UUID;
  v_can_report BOOLEAN := FALSE;
BEGIN
  IF NOT COALESCE(p_legal_ack, FALSE) THEN
    RAISE EXCEPTION 'legal_ack_required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT dudit_report_id INTO v_existing
    FROM public.return_requests
    WHERE id = p_return_request_id
      AND dudit_report_id IS NOT NULL;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('report_id', v_existing, 'idempotent', true);
    END IF;
  END IF;

  SELECT * INTO v_request
  FROM public.return_requests
  WHERE id = p_return_request_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'return_request_not_found';
  END IF;

  IF v_request.customer_user_id IS DISTINCT FROM p_reporter_user_id
     AND v_request.customer_id IS DISTINCT FROM p_reporter_user_id THEN
    RAISE EXCEPTION 'forbidden_not_customer';
  END IF;

  v_can_report := (
    v_request.sla_status = 'vencido'
    OR v_request.status = 'REJECTED'
    OR COALESCE(p_reason_code, '') IN ('seller_abuse', 'return_abuse', 'return_sla_violation', 'return_denied_unfairly')
  );

  IF NOT v_can_report THEN
    RAISE EXCEPTION 'report_not_allowed';
  END IF;

  IF v_request.dudit_report_id IS NOT NULL THEN
    RETURN jsonb_build_object('report_id', v_request.dudit_report_id, 'already_reported', true);
  END IF;

  INSERT INTO public.reports (
    reporter_user_id, target_type, target_id, reason, reason_code, description,
    status, reporter_ip_hash, reporter_ua_hash, fingerprint,
    metadata
  ) VALUES (
    p_reporter_user_id,
    'return_request',
    p_return_request_id,
    COALESCE(NULLIF(TRIM(p_reason_code), ''), 'return_issue'),
    NULLIF(TRIM(p_reason_code), ''),
    NULLIF(LEFT(TRIM(COALESCE(p_description, '')), 2000), ''),
    'pending',
    p_ip_hash, p_ua_hash, p_fingerprint,
    jsonb_build_object(
      'order_id', v_request.order_id,
      'partner_id', v_request.partner_id,
      'return_status', v_request.status,
      'sla_status', v_request.sla_status,
      'eligibility_status', v_request.eligibility_status,
      'source', 'return_report'
    )
  )
  RETURNING id INTO v_report_id;

  UPDATE public.return_requests
  SET dudit_report_id = v_report_id,
      reported_to_dudit_at = NOW(),
      updated_at = NOW()
  WHERE id = p_return_request_id;

  INSERT INTO public.return_events (
    return_request_id, partner_id, actor_user_id, event_type, message, metadata, source, idempotency_key
  ) VALUES (
    p_return_request_id, v_request.partner_id, p_reporter_user_id, 'reported_to_dudit',
    'Cliente reportou a solicitação à Dudit para análise de possível abuso da plataforma',
    jsonb_build_object('report_id', v_report_id, 'reason_code', p_reason_code),
    'user',
    CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':event' END
  );

  INSERT INTO public.suspicious_activities (user_id, activity_type, severity, details)
  VALUES (
    p_reporter_user_id,
    'return_reported_to_dudit',
    CASE WHEN v_request.sla_status = 'vencido' THEN 'medium' ELSE 'low' END,
    jsonb_build_object(
      'return_request_id', p_return_request_id,
      'partner_id', v_request.partner_id,
      'report_id', v_report_id
    )
  );

  -- Reportes geram evidência (reports + suspicious_activities + return_events).
  -- risk_score só sobe via validate_report (admin) ou regras objetivas (ex.: SLA expirado).

  RETURN jsonb_build_object('report_id', v_report_id, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_return_to_dudit(UUID, UUID, TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 15. Patch create_return_request: policy, eligibility, SLA ───────────────

CREATE OR REPLACE FUNCTION public.create_return_request(
  p_partner_id UUID,
  p_order_id UUID,
  p_created_by UUID,
  p_source TEXT,
  p_resolution TEXT,
  p_reason TEXT,
  p_message TEXT,
  p_items JSONB,
  p_evidence JSONB DEFAULT '[]'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_request_type TEXT DEFAULT NULL,
  p_origin_request_id UUID DEFAULT NULL,
  p_origin_type TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing_id UUID;
  v_request_id UUID;
  v_order RECORD;
  v_partner_name TEXT;
  v_item JSONB;
  v_evidence JSONB;
  v_order_item RECORD;
  v_qty INTEGER;
  v_already_requested INTEGER;
  v_already_resolved INTEGER;
  v_total_amount NUMERIC(14,2) := 0;
  v_evidence_count INTEGER;
  v_sku TEXT;
  v_request_type TEXT;
  v_order_subtotal NUMERIC(14,2);
  v_amount_paid NUMERIC(14,2);
  v_line_subtotal NUMERIC(14,2);
  v_line_net NUMERIC(14,2);
  v_return_net NUMERIC(14,2);
  v_parent_item_id UUID;
  v_origin_type TEXT;
  v_policy_snapshot JSONB;
  v_eligibility JSONB;
  v_sla_days INTEGER;
  v_sla_due TIMESTAMPTZ;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.return_requests
    WHERE partner_id = p_partner_id
      AND idempotency_key = p_idempotency_key
      AND deleted_at IS NULL;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('id', v_existing_id, 'idempotent', true);
    END IF;
  END IF;

  IF p_resolution NOT IN ('exchange', 'refund', 'store_credit', 'none', 'rejected') THEN
    RAISE EXCEPTION 'Resolução inválida';
  END IF;

  v_request_type := COALESCE(NULLIF(p_request_type, ''), CASE WHEN p_resolution = 'exchange' THEN 'exchange' WHEN p_resolution = 'store_credit' THEN 'store_credit' WHEN p_resolution = 'refund' THEN 'refund' ELSE 'return' END);
  IF v_request_type NOT IN ('cancellation', 'return', 'exchange', 'refund', 'store_credit') THEN
    RAISE EXCEPTION 'Tipo de solicitação inválido';
  END IF;

  IF v_request_type <> 'cancellation' AND COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item';
  END IF;

  IF COALESCE(jsonb_array_length(p_evidence), 0) > 5 THEN
    RAISE EXCEPTION 'Limite de evidências excedido';
  END IF;

  SELECT o.*
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.partner_id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_request_type = 'cancellation' AND (
    LOWER(COALESCE(v_order.situation, '')) IN ('cancelled', 'shipped', 'delivered', 'completed')
    OR LOWER(COALESCE(v_order.delivery_status, '')) IN ('sent', 'shipped', 'out_for_delivery', 'delivered', 'picked_up', 'completed', 'delivery_failed', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Pedido já está em entrega';
  END IF;

  v_policy_snapshot := COALESCE(v_order.return_policy_snapshot, public.build_return_policy_snapshot(p_partner_id));
  v_eligibility := public.calculate_return_eligibility(p_order_id, NOW());
  v_sla_days := COALESCE((v_policy_snapshot->>'sla_response_days')::INTEGER, 5);
  -- SLA interno: dias corridos (INTERVAL), não dias úteis.
  v_sla_due := NOW() + (v_sla_days || ' days')::INTERVAL;

  SELECT ROUND(COALESCE(SUM(COALESCE(oi.subtotal, oi.product_price * oi.quantity, 0)), 0)::NUMERIC, 2)
  INTO v_order_subtotal
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  v_order_subtotal := COALESCE(NULLIF(v_order.subtotal_original, 0), v_order_subtotal, 0);
  v_amount_paid := COALESCE(NULLIF(v_order.amount_paid, 0), NULLIF(v_order.paid_amount, 0), COALESCE(v_order.total_amount, 0));

  UPDATE public.orders
  SET subtotal_original = v_order_subtotal,
      shipping_total = COALESCE(NULLIF(shipping_total, 0), COALESCE(delivery_fee, 0)),
      amount_paid = v_amount_paid,
      discount_total = GREATEST(0, v_order_subtotal + COALESCE(NULLIF(shipping_total, 0), COALESCE(delivery_fee, 0)) - v_amount_paid),
      return_policy_snapshot = COALESCE(return_policy_snapshot, v_policy_snapshot)
  WHERE id = p_order_id;

  SELECT store_name INTO v_partner_name
  FROM public.partners
  WHERE id = p_partner_id;

  v_origin_type := NULLIF(p_origin_type, '');

  INSERT INTO public.return_requests (
    partner_id, order_id, customer_id, customer_user_id, source, request_type,
    desired_resolution, approved_resolution, resolution_type, reason, customer_reason,
    customer_message, customer_details, status, order_number_snapshot, order_total_snapshot,
    customer_name_snapshot, seller_name_snapshot, idempotency_key, expires_at, created_by, updated_by,
    policy_snapshot, eligibility_status, eligibility_details, sla_due_at, sla_status
  ) VALUES (
    p_partner_id, p_order_id, v_order.buyer_id,
    CASE WHEN p_source = 'marketplace' THEN v_order.buyer_id ELSE NULL END,
    COALESCE(NULLIF(p_source, ''), 'erp'), v_request_type, p_resolution, NULL, p_resolution,
    LEFT(TRIM(p_reason), 120), LEFT(TRIM(p_reason), 120),
    NULLIF(LEFT(TRIM(COALESCE(p_message, '')), 2000), ''),
    NULLIF(LEFT(TRIM(COALESCE(p_message, '')), 2000), ''),
    'PENDING_REVIEW', v_order.order_number, v_amount_paid, v_order.customer_name, v_partner_name,
    p_idempotency_key, p_expires_at, p_created_by, p_created_by,
    v_policy_snapshot,
    v_eligibility->>'status',
    COALESCE(v_eligibility->'details', '{}'::JSONB),
    v_sla_due,
    'aguardando_vendedor'
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

    SELECT oi.* INTO v_order_item
    FROM public.order_items oi
    WHERE oi.id = (v_item->>'order_item_id')::UUID AND oi.order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado'; END IF;

    SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_requested
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
      AND rr.status NOT IN ('REJECTED', 'EXPIRED');

    SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_resolved
    FROM public.return_items ri
    JOIN public.return_requests rr ON rr.id = ri.return_request_id
    WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
      AND rr.status IN ('RESOLVED', 'APPROVED', 'PROCESSING', 'WAITING_ITEM_RETURN')
      AND COALESCE(rr.approved_resolution, rr.desired_resolution) IN ('exchange', 'refund', 'store_credit');

    IF v_already_requested + v_qty > COALESCE(v_order_item.quantity, 0) THEN
      RAISE EXCEPTION 'Quantidade devolvida excede a quantidade do pedido';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.return_items ri
      JOIN public.return_requests rr ON rr.id = ri.return_request_id
      WHERE ri.order_item_id = v_order_item.id AND rr.deleted_at IS NULL
        AND rr.status IN ('RESOLVED', 'APPROVED', 'PROCESSING')
        AND COALESCE(rr.approved_resolution, rr.desired_resolution) = 'exchange'
        AND rr.exchange_order_id IS NOT NULL AND v_order.exchange_parent_order_id IS NULL
    ) THEN
      RAISE EXCEPTION 'Item já foi trocado. Use o pedido de troca ativo.';
    END IF;

    v_sku := NULL;
    IF v_order_item.variant_id IS NOT NULL THEN
      SELECT sku INTO v_sku FROM public.product_variants WHERE id = v_order_item.variant_id;
    END IF;
    IF v_sku IS NULL AND v_order_item.product_id IS NOT NULL THEN
      SELECT sku INTO v_sku FROM public.products WHERE id = v_order_item.product_id;
    END IF;
    IF v_sku IS NULL THEN v_sku := v_item->>'sku'; END IF;

    v_line_subtotal := COALESCE(v_order_item.subtotal, v_order_item.product_price * v_order_item.quantity, 0);
    v_line_net := COALESCE(v_order_item.net_item_value, v_line_subtotal);
    IF v_order_subtotal > 0 THEN
      v_line_net := ROUND((v_line_subtotal / v_order_subtotal) * v_amount_paid, 2);
    END IF;
    v_return_net := ROUND((v_line_net / GREATEST(v_order_item.quantity, 1)) * v_qty, 2);

    v_parent_item_id := public.resolve_return_parent_item_id(v_order_item.id);

    INSERT INTO public.return_items (
      return_request_id, order_item_id, product_id, variant_id,
      product_name_snapshot, sku_snapshot, unit_price_snapshot, net_item_value_snapshot,
      ordered_quantity, quantity, condition, reason, desired_resolution, metadata,
      parent_item_id, origin_request_id, origin_type
    ) VALUES (
      v_request_id, v_order_item.id, v_order_item.product_id, v_order_item.variant_id,
      COALESCE(v_order_item.product_name, 'Item'), v_sku,
      COALESCE(v_order_item.product_price, 0), v_line_net,
      v_order_item.quantity, v_qty,
      NULLIF(v_item->>'condition', ''),
      NULLIF(LEFT(COALESCE(v_item->>'reason', p_reason), 120), ''),
      p_resolution, COALESCE(v_item->'metadata', '{}'::JSONB),
      v_parent_item_id,
      COALESCE(p_origin_request_id, NULLIF(v_item->>'origin_request_id', '')::UUID),
      COALESCE(v_origin_type, NULLIF(v_item->>'origin_type', ''))
    );

    v_total_amount := v_total_amount + v_return_net;
  END LOOP;

  IF v_request_type = 'cancellation' THEN v_total_amount := v_amount_paid; END IF;

  UPDATE public.return_requests
  SET refund_amount = CASE WHEN p_resolution = 'refund' THEN v_total_amount ELSE 0 END,
      store_credit_amount = CASE WHEN p_resolution = 'store_credit' THEN v_total_amount ELSE 0 END,
      updated_at = NOW()
  WHERE id = v_request_id;

  v_evidence_count := 0;
  FOR v_evidence IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence, '[]'::JSONB))
  LOOP
    v_evidence_count := v_evidence_count + 1;
    IF v_evidence_count > 5 THEN RAISE EXCEPTION 'Limite de evidências excedido'; END IF;
    INSERT INTO public.return_evidence (
      return_request_id, file_url, file_key, file_name, file_type, file_size,
      thumbnail_url, metadata, uploaded_by
    ) VALUES (
      v_request_id, v_evidence->>'file_url', NULLIF(v_evidence->>'file_key', ''),
      NULLIF(v_evidence->>'file_name', ''), NULLIF(v_evidence->>'file_type', ''),
      NULLIF(v_evidence->>'file_size', '')::BIGINT, NULLIF(v_evidence->>'thumbnail_url', ''),
      COALESCE(v_evidence->'metadata', '{}'::JSONB), p_created_by
    );
  END LOOP;

  INSERT INTO public.return_events (
    return_request_id, partner_id, actor_user_id, event_type, to_status, message, metadata, source, idempotency_key
  ) VALUES (
    v_request_id, p_partner_id, p_created_by, 'created', 'PENDING_REVIEW',
    CASE WHEN v_request_type = 'cancellation' THEN 'Solicitação de cancelamento criada' ELSE 'Solicitação criada' END,
    jsonb_build_object(
      'resolution', p_resolution, 'request_type', v_request_type, 'source', p_source,
      'amount_basis', v_total_amount, 'eligibility_status', v_eligibility->>'status',
      'sla_due_at', v_sla_due
    ),
    'user', CASE WHEN p_idempotency_key IS NULL THEN NULL ELSE p_idempotency_key || ':event' END
  );

  INSERT INTO public.orders_history(order_id, partner_id, actor_user_id, entry_type, change_lines)
  VALUES (
    p_order_id, p_partner_id, p_created_by,
    CASE WHEN v_request_type = 'cancellation' THEN 'cancellation_requested' ELSE 'return_created' END,
    ARRAY[CASE WHEN v_request_type = 'cancellation' THEN 'Solicitação de cancelamento criada' ELSE 'Solicitação criada' END]
  );

  INSERT INTO public.return_notifications (
    return_request_id, partner_id, recipient_role, notification_type, title, message
  ) VALUES (
    v_request_id, p_partner_id, 'seller',
    CASE WHEN v_request_type = 'cancellation' THEN 'cancellation_created' ELSE 'return_created' END,
    CASE WHEN v_request_type = 'cancellation' THEN 'Nova solicitação de cancelamento' ELSE 'Nova solicitação' END,
    COALESCE(v_order.order_number, 'Pedido') || CASE WHEN v_request_type = 'cancellation' THEN ' recebeu uma solicitação de cancelamento.' ELSE ' recebeu uma solicitação de devolução ou troca.' END
  );

  RETURN jsonb_build_object(
    'id', v_request_id, 'idempotent', false, 'amount_basis', v_total_amount,
    'eligibility_status', v_eligibility->>'status', 'sla_due_at', v_sla_due
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 16. Patch process_return_request: SLA respond + rejection risk ──────────

CREATE OR REPLACE FUNCTION public.return_request_mark_sla_responded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SLA para de contar quando o vendedor responde (status sai de pendente/análise).
  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.sla_status = 'aguardando_vendedor'
     AND NEW.status NOT IN ('PENDING_REVIEW', 'UNDER_ANALYSIS') THEN
    NEW.sla_status := 'respondido';
  END IF;

  -- Recusas registram evidência; sem auto risk (ver check_return_rejection_risk).

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_request_sla_respond ON public.return_requests;
CREATE TRIGGER trg_return_request_sla_respond
  BEFORE UPDATE OF status ON public.return_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.return_request_mark_sla_responded();

-- ─── 17. Marketplace ranking: risk-based visibility (conservador) ────────────
--  0–24:  sem penalidade
-- 25–49:  penalização leve (rank × 0.88)
-- 50–74:  penalização forte (rank × 0.55)
-- 75–99:  mesma penalização forte + flag de revisão manual (sem ocultar)
-- 100:    ocultação automática na busca

CREATE OR REPLACE FUNCTION public.mp_partner_risk_rank_multiplier(p_risk_score INTEGER)
RETURNS REAL
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(p_risk_score, 0) >= 100 THEN 0.0
    WHEN COALESCE(p_risk_score, 0) >= 50 THEN 0.55
    WHEN COALESCE(p_risk_score, 0) >= 25 THEN 0.88
    ELSE 1.0
  END::REAL;
$$;

CREATE OR REPLACE FUNCTION public.mp_partner_risk_is_hidden(p_risk_score INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(p_risk_score, 0) >= 100;
$$;

COMMENT ON FUNCTION public.mp_partner_risk_rank_multiplier IS
  'Penalização conservadora no ranking. Score 75–99 não oculta - apenas rebaixa; revisão manual é responsabilidade do admin.';

COMMENT ON FUNCTION public.mp_partner_risk_is_hidden IS
  'Ocultação automática na busca somente com risk_score = 100.';

-- Patch search_marketplace: v2 (20260610) + penalização de risk_score apenas no rank.
-- NÃO alterar diversified/paginação/cursor - copiados da versão canônica.
DROP FUNCTION IF EXISTS public.search_marketplace(TEXT, TEXT, INT, REAL, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.search_marketplace(
  p_query TEXT,
  p_type TEXT DEFAULT 'tudo',
  p_limit INT DEFAULT 20,
  p_cursor_rank REAL DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_partner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  item_type TEXT,
  id UUID,
  rank REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_norm TEXT;
  v_tokens TEXT[];
  v_expanded TEXT[];
  v_tsq tsquery;
BEGIN
  v_norm := public.normalize_search_text(p_query);
  IF v_norm = '' THEN RETURN; END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_expanded := public.expand_marketplace_search_terms(v_tokens);
  v_tsq := public.build_marketplace_tsquery(p_query);

  RETURN QUERY
  WITH combined AS (
    SELECT
      'produto'::TEXT AS item_type,
      p.id,
      p.created_at,
      p.partner_id,
      public.mp_compute_search_rank(
        p.name, v_norm, v_tokens, v_expanded,
        p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, p.marketplace_score, p.rating, p.sales_last_30_days, p.created_at
      ) * public.mp_partner_risk_rank_multiplier(pt.risk_score) AS rank
    FROM public.products p
    JOIN public.partners pt ON pt.id = p.partner_id
    WHERE (p_type IN ('tudo', 'produtos'))
      AND p.is_active = TRUE
      AND p.show_in_marketplace = TRUE
      AND NOT public.mp_partner_risk_is_hidden(pt.risk_score)
      AND (p_partner_ids IS NULL OR p.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        p.name, p.mp_search_category_text, p.mp_search_subcategory_text,
        p.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'servico'::TEXT,
      s.id,
      s.created_at,
      s.partner_id,
      public.mp_compute_search_rank(
        s.name, v_norm, v_tokens, v_expanded,
        s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, s.marketplace_score, s.rating, s.bookings_last_30_days, s.created_at
      ) * public.mp_partner_risk_rank_multiplier(pt.risk_score)
    FROM public.services s
    JOIN public.partners pt ON pt.id = s.partner_id
    WHERE (p_type IN ('tudo', 'servicos'))
      AND s.is_active = TRUE
      AND s.show_in_marketplace = TRUE
      AND NOT public.mp_partner_risk_is_hidden(pt.risk_score)
      AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        s.name, s.mp_search_category_text, s.mp_search_subcategory_text,
        s.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'loja'::TEXT,
      pt.id,
      pt.created_at,
      pt.id AS partner_id,
      public.mp_compute_search_rank(
        pt.store_name, v_norm, v_tokens, v_expanded,
        pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, pt.marketplace_reputation, pt.rating, pt.completed_orders_count, pt.created_at
      ) * public.mp_partner_risk_rank_multiplier(pt.risk_score)
    FROM public.partners pt
    WHERE (p_type IN ('tudo', 'vitrines'))
      AND pt.is_active = TRUE
      AND NOT public.mp_partner_risk_is_hidden(pt.risk_score)
      AND (p_partner_ids IS NULL OR pt.id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        pt.store_name, pt.mp_search_category_text, NULL,
        pt.fts, v_tsq, v_norm, v_tokens, v_expanded
      )

    UNION ALL

    SELECT
      'plano'::TEXT,
      rp.id,
      rp.created_at,
      rp.partner_id,
      public.mp_compute_search_rank(
        rp.name, v_norm, v_tokens, v_expanded,
        NULL, NULL,
        rp.fts, v_tsq, rp.marketplace_score, 0, rp.signups_last_30_days, rp.created_at
      ) * public.mp_partner_risk_rank_multiplier(pt.risk_score)
    FROM public.recurring_plans rp
    JOIN public.partners pt ON pt.id = rp.partner_id
    WHERE (p_type IN ('tudo', 'planos'))
      AND rp.status = 'active'
      AND rp.show_in_marketplace = TRUE
      AND NOT public.mp_partner_risk_is_hidden(pt.risk_score)
      AND (p_partner_ids IS NULL OR rp.partner_id = ANY(p_partner_ids))
      AND public.mp_search_row_matches(
        rp.name, NULL, NULL,
        rp.fts, v_tsq, v_norm, v_tokens, v_expanded
      )
  ),
  diversified AS (
    SELECT
      c.*,
      row_number() OVER (PARTITION BY c.partner_id ORDER BY c.rank DESC, c.id DESC) AS seller_row
    FROM combined c
  )
  SELECT d.item_type, d.id, d.rank, d.created_at
  FROM diversified d
  WHERE d.seller_row <= 3
    AND (
      p_cursor_rank IS NULL
      OR p_cursor_id IS NULL
      OR (d.rank < p_cursor_rank OR (d.rank = p_cursor_rank AND d.id < p_cursor_id))
    )
  ORDER BY d.rank DESC, d.id DESC
  LIMIT greatest(p_limit, 1);
END;
$$;

-- ─── 18. RLS: partner_return_policies ────────────────────────────────────────

ALTER TABLE public.partner_return_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_return_policies_partner_rw ON public.partner_return_policies;
CREATE POLICY partner_return_policies_partner_rw
  ON public.partner_return_policies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = partner_return_policies.partner_id
        AND pu.user_id = auth.uid()
        AND pu.role_id IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = partner_return_policies.partner_id
        AND pu.user_id = auth.uid()
        AND pu.role_id IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS partner_return_policies_public_read ON public.partner_return_policies;
CREATE POLICY partner_return_policies_public_read
  ON public.partner_return_policies FOR SELECT
  USING (TRUE);

-- ─── 19. RLS: return_messages ────────────────────────────────────────────────

ALTER TABLE public.return_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS return_messages_partner_select ON public.return_messages;
CREATE POLICY return_messages_partner_select
  ON public.return_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = return_messages.partner_id AND pu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS return_messages_customer_select ON public.return_messages;
CREATE POLICY return_messages_customer_select
  ON public.return_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.id = return_messages.return_request_id
        AND (rr.customer_user_id = auth.uid() OR rr.customer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS return_messages_insert ON public.return_messages;
CREATE POLICY return_messages_insert
  ON public.return_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.id = return_messages.return_request_id
        AND (
          EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = rr.partner_id AND pu.user_id = auth.uid())
          OR rr.customer_user_id = auth.uid()
          OR rr.customer_id = auth.uid()
        )
    )
  );

-- Admin read via service role; moderators use admin client

-- ─── 20. Realtime publication ────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.return_messages;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 21. Grants ──────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.build_return_policy_snapshot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_return_eligibility(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_return_sla_requests() TO service_role;

COMMIT;
