-- Enable Row Level Security on account_deletions and compliance_logs
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing select policy if any
DROP POLICY IF EXISTS select_own_account_deletions ON public.account_deletions;

-- Allow authenticated users to view only their own account deletion status
CREATE POLICY select_own_account_deletions ON public.account_deletions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Note: No insert, update, or delete policies are defined for authenticated or anonymous users on either table.
-- This restricts all public/frontend mutations, while server-side actions/Trigger.dev tasks running with service_role bypass RLS and function normally.
