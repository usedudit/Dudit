-- ============================================================================
-- Migration: Add recurring_plan and community_video support to reports system
-- - Extends reports.target_type CHECK constraint
-- - Updates self-report guard trigger for recurring_plans and community_videos
-- - Updates _resolve_report_partner for risk_score attribution on validation
-- - Updates check_report_threshold auto-moderation trigger
-- - Ensures admin_audit_logs_target_type_check allows 'recurring_plan'
-- ============================================================================

BEGIN;

-- ─── 1. Extend reports.target_type CHECK constraint ────────────────────────
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE public.reports
    ADD CONSTRAINT reports_target_type_check
    CHECK (target_type IN (
        'product',
        'partner',
        'review',
        'service',
        'return_request',
        'recurring_plan',
        'community_video'
    ));

-- ─── 2. Update self-report guard trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.reports_block_self_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_owner UUID;
BEGIN
    IF NEW.target_type = 'partner' THEN
        SELECT user_id INTO target_owner FROM public.partners WHERE id = NEW.target_id;
    ELSIF NEW.target_type = 'product' THEN
        SELECT p.user_id INTO target_owner
          FROM public.products pr
          JOIN public.partners p ON p.id = pr.partner_id
         WHERE pr.id = NEW.target_id;
    ELSIF NEW.target_type = 'service' THEN
        SELECT p.user_id INTO target_owner
          FROM public.services s
          JOIN public.partners p ON p.id = s.partner_id
         WHERE s.id = NEW.target_id;
    ELSIF NEW.target_type = 'recurring_plan' THEN
        SELECT p.user_id INTO target_owner
          FROM public.recurring_plans rp
          JOIN public.partners p ON p.id = rp.partner_id
         WHERE rp.id = NEW.target_id;
    ELSIF NEW.target_type = 'community_video' THEN
        SELECT p.user_id INTO target_owner
          FROM public.community_videos cv
          JOIN public.partners p ON p.id = cv.partner_id
         WHERE cv.id = NEW.target_id;
    ELSIF NEW.target_type = 'review' THEN
        SELECT user_id INTO target_owner FROM public.reviews WHERE id = NEW.target_id;
    END IF;

    IF target_owner IS NOT NULL AND target_owner = NEW.reporter_user_id THEN
        RAISE EXCEPTION 'self_report_forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- ─── 3. Update _resolve_report_partner for risk_score attribution ──────────
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
    ELSIF p_target_type = 'recurring_plan' THEN
        SELECT partner_id INTO pid FROM public.recurring_plans WHERE id = p_target_id;
    ELSIF p_target_type = 'community_video' THEN
        SELECT partner_id INTO pid FROM public.community_videos WHERE id = p_target_id;
    ELSIF p_target_type = 'review' THEN
        SELECT partner_id INTO pid FROM public.reviews WHERE id = p_target_id;
    ELSIF p_target_type = 'return_request' THEN
        SELECT partner_id INTO pid FROM public.return_requests WHERE id = p_target_id;
    END IF;
    RETURN pid;
END;
$$;

-- ─── 4. Update auto-flag threshold trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_report_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    distinct_count INTEGER;
BEGIN
    IF NEW.target_type NOT IN ('product', 'recurring_plan', 'community_video') THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(DISTINCT r.reporter_user_id) INTO distinct_count
    FROM public.reports r
    JOIN auth.users u ON u.id = r.reporter_user_id
    WHERE r.target_type = NEW.target_type
      AND r.target_id = NEW.target_id
      AND r.status = 'pending'
      AND u.created_at < now() - interval '7 days';

    IF distinct_count >= 3 THEN
        IF NEW.target_type = 'product' THEN
            UPDATE public.products
               SET moderation_status = 'pending_moderation'
             WHERE id = NEW.target_id
               AND moderation_status = 'approved'
               AND deleted_at IS NULL;
        ELSIF NEW.target_type = 'recurring_plan' THEN
            UPDATE public.recurring_plans
               SET moderation_status = 'pending_moderation'
             WHERE id = NEW.target_id
               AND moderation_status = 'approved';
        ELSIF NEW.target_type = 'community_video' THEN
            UPDATE public.community_videos
               SET moderation_status = 'pending_moderation'
             WHERE id = NEW.target_id
               AND moderation_status = 'approved';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ─── 5. Ensure admin_audit_logs allows 'recurring_plan' target_type ────────
ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;
ALTER TABLE public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_target_type_check
    CHECK (target_type IN (
        'user', 'partner', 'product', 'service', 'subscription', 'recurring_plan',
        'system', 'review', 'return_request', 'advertisement',
        'marketplace_synonym_group', 'marketplace_synonym_term',
        'delivery_driver', 'community_video', 'refund_request', 'purchase', 'payment',
        'service_order', 'quote', 'promotion', 'blog_post'
    ));

COMMIT;
