-- Clean up unused columns from public.audit_logs
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS target_user_id;
