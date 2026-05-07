-- ============================================================================
-- Migration: Partner risk ledger + atomic RPCs for report moderation
-- Reuses public.reports + public.partners.risk_score.
-- - Adds partner_risk_events (auditable, reversible, idempotent per-source).
-- - Adds RPCs that mutate report status + risk_score atomically:
--     validate_report   : pending -> validated   (+5 to risk_score, 1x guard)
--     dismiss_report    : pending -> dismissed   (no risk change)
--     mark_report_spam  : pending -> spam        (no risk change)
--     revert_report_validation : validated -> dismissed (-5 to risk_score)
-- - All RPCs verify caller is in admin_roles (moderator|admin|super_admin)
--   and run as SECURITY DEFINER so moderators can update partners.risk_score
--   even though admin_update_partners RLS only allows admin/super_admin.
-- ============================================================================

BEGIN;

-- ─── 1. Partner risk events (ledger) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_risk_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id      UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL,
    source_id       UUID NOT NULL,
    points          INTEGER NOT NULL,
    admin_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reverted_at     TIMESTAMPTZ,
    reverted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revert_reason   TEXT
);

COMMENT ON TABLE public.partner_risk_events IS
'Auditable, reversible ledger of risk_score changes on partners. 1 active row per (source_type, source_id).';

-- Idempotency: only ONE active (non-reverted) event per source.
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_risk_events_source_active
    ON public.partner_risk_events (source_type, source_id)
    WHERE reverted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_partner_risk_events_partner_created
    ON public.partner_risk_events (partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_risk_events_admin
    ON public.partner_risk_events (admin_user_id, created_at DESC);

ALTER TABLE public.partner_risk_events ENABLE ROW LEVEL SECURITY;

-- Admins can read; service-role bypasses RLS for inserts via SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "partner_risk_events_admin_select" ON public.partner_risk_events;
CREATE POLICY "partner_risk_events_admin_select"
    ON public.partner_risk_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE user_id = auth.uid()
            AND role IN ('moderator', 'admin', 'super_admin')
        )
    );

-- ─── 2. Helper: assert caller is admin/moderator/super_admin ───────────────
CREATE OR REPLACE FUNCTION public._assert_admin_caller()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    uid UUID := auth.uid();
BEGIN
    IF uid IS NULL THEN
        RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = uid
          AND role IN ('moderator', 'admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'forbidden_not_admin' USING ERRCODE = '42501';
    END IF;

    RETURN uid;
END;
$$;

-- ─── 3. Helper: resolve a report target to its owning partner_id ───────────
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
    END IF;
    RETURN pid;
END;
$$;

-- ─── 4. RPC: validate_report (pending -> validated, +N risk, idempotent) ───
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

    -- Atomic state transition (race-safe: WHERE status='pending')
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

    -- Risk event (1 per report; ON CONFLICT keeps idempotency on retries).
    IF partner_uuid IS NOT NULL AND p_points > 0 THEN
        INSERT INTO public.partner_risk_events
            (partner_id, source_type, source_id, points, admin_user_id, metadata)
        VALUES
            (partner_uuid, 'report_validated', p_report_id, p_points, admin_uid,
             jsonb_build_object('target_type', r_target_type, 'target_id', r_target_id))
        ON CONFLICT (source_type, source_id) WHERE reverted_at IS NULL DO NOTHING
        RETURNING id INTO inserted_event;

        IF inserted_event IS NOT NULL THEN
            UPDATE public.partners
               SET risk_score = LEAST(100, COALESCE(risk_score, 0) + p_points)
             WHERE id = partner_uuid
            RETURNING risk_score INTO new_score;
            points_applied := p_points;
        ELSE
            -- already had an active event for this report (idempotent retry)
            SELECT risk_score INTO new_score FROM public.partners WHERE id = partner_uuid;
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

-- ─── 5. RPC: dismiss_report (pending -> dismissed, no risk change) ─────────
CREATE OR REPLACE FUNCTION public.dismiss_report(
    p_report_id UUID,
    p_reason    TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_uid     UUID := public._assert_admin_caller();
    r_target_type TEXT;
    r_target_id   UUID;
BEGIN
    UPDATE public.reports
       SET status            = 'dismissed',
           resolved_by       = admin_uid,
           resolved_at       = now(),
           resolution_reason = p_reason
     WHERE id = p_report_id
       AND status = 'pending'
    RETURNING target_type, target_id INTO r_target_type, r_target_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('updated', false, 'reason', 'not_pending');
    END IF;

    RETURN jsonb_build_object(
        'updated', true,
        'report_id', p_report_id,
        'target_type', r_target_type,
        'target_id', r_target_id,
        'admin_user_id', admin_uid
    );
END;
$$;

-- ─── 6. RPC: mark_report_spam (pending -> spam, no risk change) ────────────
CREATE OR REPLACE FUNCTION public.mark_report_spam(
    p_report_id UUID,
    p_reason    TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_uid     UUID := public._assert_admin_caller();
    r_target_type TEXT;
    r_target_id   UUID;
BEGIN
    UPDATE public.reports
       SET status            = 'spam',
           resolved_by       = admin_uid,
           resolved_at       = now(),
           resolution_reason = p_reason
     WHERE id = p_report_id
       AND status = 'pending'
    RETURNING target_type, target_id INTO r_target_type, r_target_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('updated', false, 'reason', 'not_pending');
    END IF;

    RETURN jsonb_build_object(
        'updated', true,
        'report_id', p_report_id,
        'target_type', r_target_type,
        'target_id', r_target_id,
        'admin_user_id', admin_uid
    );
END;
$$;

-- ─── 7. RPC: revert_report_validation (validated -> dismissed, -N risk) ────
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

    -- Revert the active risk event for this report (if any).
    UPDATE public.partner_risk_events
       SET reverted_at   = now(),
           reverted_by   = admin_uid,
           revert_reason = p_reason
     WHERE source_type = 'report_validated'
       AND source_id   = p_report_id
       AND reverted_at IS NULL
    RETURNING points, partner_id INTO reverted_pts, affected_partner;

    IF affected_partner IS NOT NULL AND reverted_pts > 0 THEN
        UPDATE public.partners
           SET risk_score = GREATEST(0, COALESCE(risk_score, 0) - reverted_pts)
         WHERE id = affected_partner
        RETURNING risk_score INTO new_score;
    ELSE
        SELECT risk_score INTO new_score FROM public.partners WHERE id = affected_partner;
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

-- ─── 8. RPC: get_admin_reports_stats (single round-trip counters) ──────────
CREATE OR REPLACE FUNCTION public.get_admin_reports_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    res JSONB;
BEGIN
    PERFORM public._assert_admin_caller();

    SELECT jsonb_build_object(
        'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
        'validated', COUNT(*) FILTER (WHERE status = 'validated'),
        'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
        'spam',      COUNT(*) FILTER (WHERE status = 'spam'),
        'total',     COUNT(*)
    )
    INTO res
    FROM public.reports;

    RETURN COALESCE(res, '{"pending":0,"validated":0,"dismissed":0,"spam":0,"total":0}'::jsonb);
END;
$$;

-- ─── 9. RPC: get_target_report_summary (per-target aggregates) ─────────────
CREATE OR REPLACE FUNCTION public.get_target_report_summary(
    p_target_type TEXT,
    p_target_id   UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    res JSONB;
BEGIN
    PERFORM public._assert_admin_caller();

    SELECT jsonb_build_object(
        'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
        'validated', COUNT(*) FILTER (WHERE status = 'validated'),
        'dismissed', COUNT(*) FILTER (WHERE status = 'dismissed'),
        'spam',      COUNT(*) FILTER (WHERE status = 'spam'),
        'total',     COUNT(*),
        'distinct_reporters', COUNT(DISTINCT reporter_user_id)
    )
    INTO res
    FROM public.reports
    WHERE target_type = p_target_type
      AND target_id   = p_target_id;

    RETURN COALESCE(res, '{}'::jsonb);
END;
$$;

-- ─── 10. Grants for authenticated callers (admin checks happen inside) ─────
GRANT EXECUTE ON FUNCTION public.validate_report(UUID, TEXT, INTEGER)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_report(UUID, TEXT)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_report_spam(UUID, TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_report_validation(UUID, TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_reports_stats()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_target_report_summary(TEXT, UUID)           TO authenticated;

COMMIT;
