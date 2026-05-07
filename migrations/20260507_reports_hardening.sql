-- ============================================================================
-- Migration: Reports hardening (no parallel system)
-- Extends the existing public.reports table introduced by 902_reports_system.sql
-- - New status: 'spam' (admin-marked as fraudulent)
-- - Optional reason_code (allow-listed) alongside the legacy free-text 'reason'
-- - Anti-abuse columns: ip/ua/fingerprint hashes + metadata
-- - DB-side sanitization trigger (uses sanitize_text from 040 audit migration)
-- - Aggregation/keyset indexes for admin queries
-- - Backwards-compatible: keeps current schema, policies and trigger intact
-- ============================================================================

BEGIN;

-- ─── 1. Status CHECK: add 'spam' (rebuild constraint atomically) ───────────
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports
    ADD CONSTRAINT reports_status_check
    CHECK (status IN ('pending', 'validated', 'dismissed', 'spam'));

-- ─── 2. New columns (all nullable / safe defaults to keep compatibility) ───
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reporter_ip_hash TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reporter_ua_hash TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

COMMENT ON COLUMN public.reports.reason_code      IS 'Optional canonical reason code (allow-list managed in app: lib/admin/report-reasons.ts).';
COMMENT ON COLUMN public.reports.reporter_ip_hash IS 'SHA-256 hash of reporter IP (server-side only). Never store raw IPs.';
COMMENT ON COLUMN public.reports.reporter_ua_hash IS 'SHA-256 hash of reporter user-agent.';
COMMENT ON COLUMN public.reports.fingerprint      IS 'Short fingerprint for anti-duplicate analytics (user|target|reasonCode|ipPrefix).';
COMMENT ON COLUMN public.reports.resolution_reason IS 'Free-text explanation given by the moderator on validate/dismiss/spam/revert.';

-- ─── 3. Sanitization trigger (BEFORE INSERT/UPDATE) ────────────────────────
-- Uses public.sanitize_text() created in 040_database_security_audit.sql.
-- Limits: reason 200 chars, description 2000 chars, resolution_reason 1000 chars.
CREATE OR REPLACE FUNCTION public.reports_sanitize_inputs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.reason IS NOT NULL THEN
        NEW.reason := public.sanitize_text(NEW.reason, 200);
    END IF;

    IF NEW.description IS NOT NULL THEN
        NEW.description := public.sanitize_text(NEW.description, 2000);
    END IF;

    IF NEW.resolution_reason IS NOT NULL THEN
        NEW.resolution_reason := public.sanitize_text(NEW.resolution_reason, 1000);
    END IF;

    -- reason_code allow-list is enforced in the app; we only ensure it stays short.
    IF NEW.reason_code IS NOT NULL THEN
        NEW.reason_code := public.sanitize_text(NEW.reason_code, 64);
    END IF;

    -- Hashes are generated server-side; we hard-cap their length to avoid abuse.
    IF NEW.fingerprint IS NOT NULL THEN
        NEW.fingerprint := public.sanitize_text(NEW.fingerprint, 128);
    END IF;
    IF NEW.reporter_ip_hash IS NOT NULL THEN
        NEW.reporter_ip_hash := public.sanitize_text(NEW.reporter_ip_hash, 128);
    END IF;
    IF NEW.reporter_ua_hash IS NOT NULL THEN
        NEW.reporter_ua_hash := public.sanitize_text(NEW.reporter_ua_hash, 128);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_sanitize_inputs ON public.reports;
CREATE TRIGGER trg_reports_sanitize_inputs
    BEFORE INSERT OR UPDATE OF reason, description, resolution_reason, reason_code, fingerprint, reporter_ip_hash, reporter_ua_hash
    ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION public.reports_sanitize_inputs();

-- ─── 4. Self-report guard (defense-in-depth) ───────────────────────────────
-- App-level guard exists in createReport(); this trigger blocks self-reports
-- even if a malicious client bypasses the action. Only blocks 'partner' /
-- 'product' / 'service' types (the ones we can resolve to a partner.user_id).
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
    ELSIF NEW.target_type = 'review' THEN
        SELECT user_id INTO target_owner FROM public.reviews WHERE id = NEW.target_id;
    END IF;

    IF target_owner IS NOT NULL AND target_owner = NEW.reporter_user_id THEN
        RAISE EXCEPTION 'self_report_forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_block_self_report ON public.reports;
CREATE TRIGGER trg_reports_block_self_report
    BEFORE INSERT ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION public.reports_block_self_report();

-- ─── 5. Indexes for admin queries / aggregations / keyset pagination ───────
-- Admin list paginated by status + (created_at, id) keyset.
CREATE INDEX IF NOT EXISTS idx_reports_status_created_id
    ON public.reports (status, created_at DESC, id DESC);

-- Aggregate counts per target (used by getReportContext and badges).
CREATE INDEX IF NOT EXISTS idx_reports_target_status
    ON public.reports (target_type, target_id, status);

-- Reporter history (cooldown / abuse heuristics).
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created
    ON public.reports (reporter_user_id, created_at DESC);

-- Fingerprint analytics (only when populated, keeps index tiny).
CREATE INDEX IF NOT EXISTS idx_reports_fingerprint
    ON public.reports (fingerprint)
    WHERE fingerprint IS NOT NULL;

-- target_type filtering combined with status / created_at keyset.
CREATE INDEX IF NOT EXISTS idx_reports_target_type_status_created
    ON public.reports (target_type, status, created_at DESC, id DESC);

-- ─── 6. Allow target_type='review' in admin_audit_logs (was missing) ──────
-- Reports against reviews must be auditable; the original CHECK in
-- 900_create_admin_panel_schema.sql did not include 'review'. We rebuild
-- the CHECK adding 'review' so report.* audit logs are never rejected.
ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;
ALTER TABLE public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_target_type_check
    CHECK (target_type IN ('user', 'partner', 'product', 'service', 'subscription', 'system', 'review'));

-- Same change for admin_actions (queued admin operations).
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE public.admin_actions
    ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN ('user', 'partner', 'product', 'service', 'subscription', 'system', 'review'));

-- ─── 7. Realtime publication (for postgres_changes in admin panel) ────────
-- supabase_realtime publication usually exists; add reports if missing.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.reports';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN others THEN NULL;
        END;
    END IF;
END $$;

COMMIT;
