-- ============================================================================
-- ADMIN PANEL SCHEMA — Production-Grade Security
-- ============================================================================
-- Tables: admin_roles, admin_audit_logs, admin_step_up_tokens
-- Plus: role-scoped RLS on existing tables for dual protection
-- ============================================================================

-- ─── 1. ADMIN ROLES TABLE ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator')),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_protected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_roles IS 'Admin role assignments. Only service-role can read/write.';
COMMENT ON COLUMN public.admin_roles.is_protected IS 'Protected admins cannot be banned, removed, or modified by other admins.';
COMMENT ON COLUMN public.admin_roles.role IS 'super_admin: full access. admin: enforcement + financial. moderator: moderation only.';
COMMENT ON COLUMN public.admin_roles.scopes IS 'Fine-grained scopes: moderation, user_enforcement, billing_control, audit_access, system_settings';

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon/authenticated — only service-role can access.
-- This means regular users (even if they somehow guess the table) get zero rows.


-- ─── 2. ADMIN AUDIT LOGS TABLE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'partner', 'product', 'service', 'subscription', 'system')),
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  session_id TEXT,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_audit_logs IS 'Immutable audit log for all admin actions. INSERT only — no UPDATE, no DELETE.';

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon/authenticated — only service-role can insert.
-- Immutability is enforced by the trigger below.

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id ON public.admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type ON public.admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);


-- ─── 3. IMMUTABILITY TRIGGER (audit logs) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is immutable. UPDATE and DELETE are forbidden.';
  RETURN NULL;
END;
$$;

-- Drop first to make migration idempotent
DROP TRIGGER IF EXISTS trg_prevent_audit_log_update ON public.admin_audit_logs;
DROP TRIGGER IF EXISTS trg_prevent_audit_log_delete ON public.admin_audit_logs;

CREATE TRIGGER trg_prevent_audit_log_update
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_modification();

CREATE TRIGGER trg_prevent_audit_log_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_modification();


-- ─── 4. ADMIN STEP-UP TOKENS TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_step_up_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_step_up_tokens IS 'Short-lived tokens for step-up re-authentication on critical admin actions.';

ALTER TABLE public.admin_step_up_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon/authenticated — only service-role can access.

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_admin_step_up_tokens_user_id ON public.admin_step_up_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_step_up_tokens_expires_at ON public.admin_step_up_tokens(expires_at);


-- ─── 5. CLEANUP FUNCTION (expired step-up tokens) ──────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_expired_step_up_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.admin_step_up_tokens
  WHERE expires_at < now() - INTERVAL '1 hour';
END;
$$;


-- ─── 5b. ADMIN ACTIONS QUEUE TABLE ──────────────────────────────────────────
-- Destructive operations are queued here instead of executing directly.
-- Supports delayed execution (schedule_for) and cancellation.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'partner', 'product', 'service', 'subscription', 'system')),
  target_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'executing', 'completed', 'failed', 'cancelled')),
  schedule_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES auth.users(id),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  step_up_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_actions IS 'Admin action queue for destructive operations. Supports delayed execution and cancellation.';

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- No RLS policies for anon/authenticated — only service-role can access.

CREATE INDEX IF NOT EXISTS idx_admin_actions_status ON public.admin_actions(status);
CREATE INDEX IF NOT EXISTS idx_admin_actions_schedule ON public.admin_actions(schedule_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions(admin_user_id);


-- ============================================================================
-- 6. ROLE-SCOPED RLS POLICIES ON EXISTING TABLES (Dual Protection)
-- ============================================================================
-- These policies allow admin users to perform cross-tenant operations
-- through the regular authenticated Supabase client.
-- Even if requireAdmin() fails, these RLS policies still block mutations
-- because auth.uid() won't match any admin_roles row.
-- ============================================================================

-- ─── Products: Moderators + Admins can update (moderation, soft-delete) ────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_products' AND tablename = 'products'
  ) THEN
    CREATE POLICY "admin_update_products" ON public.products FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin', 'super_admin')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_select_products' AND tablename = 'products'
  ) THEN
    CREATE POLICY "admin_select_products" ON public.products FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- ─── Services: Moderators + Admins can update (moderation, soft-delete) ────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_services' AND tablename = 'services'
  ) THEN
    CREATE POLICY "admin_update_services" ON public.services FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
        AND role IN ('moderator', 'admin', 'super_admin')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_select_services' AND tablename = 'services'
  ) THEN
    CREATE POLICY "admin_select_services" ON public.services FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

-- ─── Partners: Only Admin/Super Admin can update (suspend, disable) ────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_partners' AND tablename = 'partners'
  ) THEN
    CREATE POLICY "admin_update_partners" ON public.partners FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
      ));
  END IF;
END $$;

-- Partners already have select_all policy, no need for admin-specific SELECT

-- ─── User Profiles: Only Admin/Super Admin can update (ban/unban) ──────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_user_profiles' AND tablename = 'user_profiles'
  ) THEN
    CREATE POLICY "admin_update_user_profiles" ON public.user_profiles FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'admin_select_user_profiles' AND tablename = 'user_profiles'
  ) THEN
    CREATE POLICY "admin_select_user_profiles" ON public.user_profiles FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
      ));
  END IF;
END $$;


-- ============================================================================
-- 7. ADD ENFORCEMENT COLUMNS TO EXISTING TABLES (if missing)
-- ============================================================================

-- user_profiles: ban tracking
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES auth.users(id);

-- partners: suspension + ERP disable tracking
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id);
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS erp_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS erp_disabled_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS erp_disabled_by UUID REFERENCES auth.users(id);

-- products: soft-delete tracking
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- services: soft-delete tracking
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_reason TEXT;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
