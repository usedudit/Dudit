-- Alter admin_audit_logs.admin_user_id column to be nullable to match the ON DELETE SET NULL constraint rule
ALTER TABLE public.admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL;
