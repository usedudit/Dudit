-- Up Migration: Create Account Deletion Requests table (Transient OTP Challenge)
-- This table stores ephemeral 6-digit confirmation codes (SHA-256 hashed)
-- for the 2-step account deletion verification flow.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  verified_at TIMESTAMPTZ,
  request_ip TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user lookups of recent/active requests
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id 
  ON public.account_deletion_requests(user_id);

-- Index for rate-limiting, daily quota, and anti-abuse audits
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_created_at 
  ON public.account_deletion_requests(created_at);

-- Index for email queries
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_email 
  ON public.account_deletion_requests(email);

-- Enable Row Level Security (RLS)
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view only their own requests
DROP POLICY IF EXISTS select_own_account_deletion_requests ON public.account_deletion_requests;
CREATE POLICY select_own_account_deletion_requests ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Note: Mutations (INSERT, UPDATE, DELETE) are restricted to service_role / server actions.
