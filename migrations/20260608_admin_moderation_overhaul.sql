-- Migration: New admin moderation system
-- 1. Add risk_score to user_profiles
-- 2. Add moderation_status to services
-- 3. Add moderation_reviewed fields to services
-- 4. Add moderation_reviewed fields to reviews
-- 5. Create partner_moderation_actions log table

-- ============================================================================
-- 1. risk_score em user_profiles
-- ============================================================================
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_user_profiles_risk_score ON user_profiles(risk_score DESC);

-- ============================================================================
-- 2. moderation_status em services (espelho do que products já tem)
-- ============================================================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS moderation_reviewed_by UUID;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS moderation_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_services_moderation_status ON services(moderation_status);

-- ============================================================================
-- 3. moderation_reviewed_fields em reviews
-- ============================================================================
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS moderation_reviewed_by UUID;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS moderation_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 4. Partner moderation actions log (audit trail for manual admin actions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.partner_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  field_name TEXT,
  previous_value TEXT,
  new_value TEXT,
  risk_score_increment INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_moderation_actions_partner ON partner_moderation_actions(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_moderation_actions_admin ON partner_moderation_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_moderation_actions_created ON partner_moderation_actions(created_at DESC);

-- ============================================================================
-- 5. RPC: Increment user risk score
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_user_risk_score(p_user_id UUID, p_points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_score INTEGER;
BEGIN
  UPDATE public.user_profiles
  SET risk_score = LEAST(100, GREATEST(0, COALESCE(risk_score, 0) + p_points))
  WHERE id = p_user_id
  RETURNING risk_score INTO new_score;

  RETURN new_score;
END;
$$;

-- ============================================================================
-- 6. Services keyset pagination index (consistência com idx_products_partner_created_id_desc)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_services_partner_created_id_desc
  ON services(partner_id, created_at DESC, id DESC);
