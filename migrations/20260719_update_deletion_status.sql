-- Clean up test records to avoid check constraint violations
DELETE FROM public.account_deletions;
DELETE FROM public.compliance_logs;

-- Update status constraint on account_deletions to support the new step checkpoints
ALTER TABLE public.account_deletions DROP CONSTRAINT IF EXISTS account_deletions_status_check;

ALTER TABLE public.account_deletions ADD CONSTRAINT account_deletions_status_check CHECK (status IN (
  'deleting_storage',
  'deleting_external_services',
  'deleting_marketplace',
  'deleting_database',
  'deleting_auth',
  'completed',
  'failed'
));
