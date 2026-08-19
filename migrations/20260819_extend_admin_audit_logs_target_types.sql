-- Extend admin_audit_logs target_type check to include target types used by
-- newer admin features (community videos, marketplace synonyms, recurring plans).
-- Without this, adminAuditLog() inserts fail with:
--   new row for relation "admin_audit_logs" violates check constraint "admin_audit_logs_target_type_check"

ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;

ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
    CHECK (target_type IN (
        'user', 'partner', 'product', 'service', 'subscription',
        'recurring_plan', 'system', 'review', 'return_request',
        'advertisement', 'marketplace_synonym_group', 'marketplace_synonym_term',
        'community_video', 'collection'
    ));n