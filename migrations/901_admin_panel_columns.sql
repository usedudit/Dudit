-- ============================================================================
-- ADMIN PANEL - Missing columns for real data integration
-- Run AFTER 900_create_admin_panel_schema.sql
-- ============================================================================

-- ─── 1. user_profiles: duration-based bans ─────────────────────────────────
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

-- ─── 2. partners: duration-based suspension ────────────────────────────────
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

-- ─── 3. products: moderation review tracking ───────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS moderation_reviewed_by UUID REFERENCES auth.users(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS moderation_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

-- ─── 4. Index for moderation queue queries ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_pending_moderation
  ON products(created_at DESC)
  WHERE moderation_status = 'pending_moderation';
