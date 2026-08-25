-- Fix validate_report and revert_report_validation RPCs to use stores.risk_score
-- instead of the dropped partners.risk_score column.

BEGIN;

-- ─── 1. Fix _resolve_report_partner to also handle 'store' target type ─────
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
    ELSIF p_target_type = 'store' THEN
        SELECT partner_id INTO pid FROM public.stores WHERE id = p_target_id;
    ELSIF p_target_type = 'product' THEN
        SELECT partner_id INTO pid FROM public.products WHERE id = p_target_id;
    ELSIF p_target_type = 'service' THEN
        SELECT partner_id INTO pid FROM public.services WHERE id = p_target_id;
    ELSIF p_target_type = 'review' THEN
        SELECT partner_id INTO pid FROM public.reviews WHERE id = p_target_id;
    END IF;
    RETURN pid;
END;
$$;

-- ─── 2. Fix validate_report: update stores.risk_score instead of partners ───
CREATE OR REPLACE FUNCTION public.validate_report(
    p_report_id     UUID,
    p_reason        TEXT,
    p_points        INTEGER DEFAULT 5
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_uid       UUID := public._assert_admin_caller();
    r_target_type   TEXT;
    r_target_id     UUID;
    partner_uuid    UUID;
    inserted_event  UUID;
    new_score       INTEGER;
    points_applied  INTEGER := 0;
BEGIN
    IF p_points IS NULL OR p_points < 0 OR p_points > 50 THEN
        RAISE EXCEPTION 'invalid_points' USING ERRCODE = '22023';
    END IF;

    UPDATE public.reports
       SET status            = 'validated',
           resolved_by       = admin_uid,
           resolved_at       = now(),
           resolution_reason = p_reason
     WHERE id = p_report_id
       AND status = 'pending'
    RETURNING target_type, target_id
        INTO r_target_type, r_target_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('updated', false, 'reason', 'not_pending');
    END IF;

    partner_uuid := public._resolve_report_partner(r_target_type, r_target_id);

    IF partner_uuid IS NOT NULL AND p_points > 0 THEN
        INSERT INTO public.partner_risk_events
            (partner_id, source_type, source_id, points, admin_user_id, metadata)
        VALUES
            (partner_uuid, 'report_validated', p_report_id, p_points, admin_uid,
             jsonb_build_object('target_type', r_target_type, 'target_id', r_target_id))
        ON CONFLICT (source_type, source_id) WHERE reverted_at IS NULL DO NOTHING
        RETURNING id INTO inserted_event;

        IF inserted_event IS NOT NULL THEN
            UPDATE public.stores
               SET risk_score = LEAST(100, COALESCE(risk_score, 0) + p_points)
             WHERE partner_id = partner_uuid
            RETURNING risk_score INTO new_score;
            points_applied := p_points;
        ELSE
            SELECT risk_score INTO new_score FROM public.stores WHERE partner_id = partner_uuid LIMIT 1;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'updated', true,
        'report_id', p_report_id,
        'target_type', r_target_type,
        'target_id', r_target_id,
        'partner_id', partner_uuid,
        'points_applied', points_applied,
        'risk_score', COALESCE(new_score, 0),
        'admin_user_id', admin_uid
    );
END;
$$;

-- ─── 3. Fix revert_report_validation: update stores.risk_score instead ──────
CREATE OR REPLACE FUNCTION public.revert_report_validation(
    p_report_id UUID,
    p_reason    TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_uid       UUID := public._assert_admin_caller();
    r_target_type   TEXT;
    r_target_id     UUID;
    reverted_pts    INTEGER := 0;
    affected_partner UUID;
    new_score       INTEGER;
BEGIN
    UPDATE public.reports
       SET status            = 'dismissed',
           resolved_by       = admin_uid,
           resolved_at       = now(),
           resolution_reason = p_reason
     WHERE id = p_report_id
       AND status = 'validated'
    RETURNING target_type, target_id INTO r_target_type, r_target_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('updated', false, 'reason', 'not_validated');
    END IF;

    UPDATE public.partner_risk_events
       SET reverted_at   = now(),
           reverted_by   = admin_uid,
           revert_reason = p_reason
     WHERE source_type = 'report_validated'
       AND source_id   = p_report_id
       AND reverted_at IS NULL
    RETURNING points, partner_id INTO reverted_pts, affected_partner;

    IF affected_partner IS NOT NULL AND reverted_pts > 0 THEN
        UPDATE public.stores
           SET risk_score = GREATEST(0, COALESCE(risk_score, 0) - reverted_pts)
         WHERE partner_id = affected_partner
        RETURNING risk_score INTO new_score;
    ELSE
        SELECT risk_score INTO new_score FROM public.stores WHERE partner_id = affected_partner LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'updated', true,
        'report_id', p_report_id,
        'target_type', r_target_type,
        'target_id', r_target_id,
        'partner_id', affected_partner,
        'points_reverted', COALESCE(reverted_pts, 0),
        'risk_score', COALESCE(new_score, 0),
        'admin_user_id', admin_uid
    );
END;
$$;

-- ─── 4. Re-grant permissions ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.validate_report(UUID, TEXT, INTEGER)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_report_validation(UUID, TEXT)     TO authenticated;

COMMIT;
