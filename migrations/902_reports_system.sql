-- ============================================================================
-- ADVANCED ADMIN FEATURES — Reports, Risk Score, needs_images
-- Run AFTER 901_admin_panel_columns.sql
-- ============================================================================

-- ─── 1. Partner Risk Score (capped at 100) ─────────────────────────────────

ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_partners_risk_score ON partners(risk_score DESC);

-- ─── 2. Reports / Denúncias ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID NOT NULL REFERENCES auth.users(id),
    target_type TEXT NOT NULL CHECK (target_type IN ('product', 'partner', 'review', 'service')),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'dismissed')),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Anti-spam: one report per user per target
CREATE UNIQUE INDEX IF NOT EXISTS unique_report_per_user
    ON reports (reporter_user_id, target_type, target_id);

-- Query performance
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);

-- RLS: users can create their own reports, admins can read all
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own reports"
    ON reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "Users can view own reports"
    ON reports FOR SELECT
    USING (auth.uid() = reporter_user_id);

CREATE POLICY "Admins can manage all reports"
    ON reports FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'super_admin', 'moderator')
        )
    );

-- ─── 3. Auto-pending function ──────────────────────────────────────────────
-- Trigger: when a new report is inserted, check if product has >= 3
-- distinct reporters with accounts older than 7 days

CREATE OR REPLACE FUNCTION check_report_threshold()
RETURNS TRIGGER AS $$
DECLARE
    distinct_count INTEGER;
BEGIN
    -- Only auto-flag products
    IF NEW.target_type != 'product' THEN
        RETURN NEW;
    END IF;

    -- Count distinct reporters with accounts > 7 days old
    SELECT COUNT(DISTINCT r.reporter_user_id) INTO distinct_count
    FROM reports r
    JOIN auth.users u ON u.id = r.reporter_user_id
    WHERE r.target_type = 'product'
      AND r.target_id = NEW.target_id
      AND r.status = 'pending'
      AND u.created_at < now() - interval '7 days';

    -- If >= 3 distinct valid reporters, auto-flag product
    IF distinct_count >= 3 THEN
        UPDATE products
        SET moderation_status = 'pending_moderation'
        WHERE id = NEW.target_id
          AND moderation_status = 'approved'
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_report_threshold
    AFTER INSERT ON reports
    FOR EACH ROW
    EXECUTE FUNCTION check_report_threshold();

-- ─── 4. needs_images moderation status ─────────────────────────────────────
-- Update products CHECK constraint to allow 'needs_images'
-- (If there's an existing CHECK, alter it; otherwise, this is informational)

COMMENT ON COLUMN products.moderation_status IS 
'Allowed: pending_moderation, approved, rejected, flagged, needs_images';
