-- ============================================================================
-- Migration: Add moderation columns to recurring_plans
-- Parity with products and services tables for platform content safety
-- ============================================================================

ALTER TABLE public.recurring_plans
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_recurring_plans_moderation_status 
  ON public.recurring_plans(moderation_status);

COMMENT ON COLUMN public.recurring_plans.moderation_status IS 'Status de moderação de conteúdo (approved, flagged, pending_moderation, rejected)';
COMMENT ON COLUMN public.recurring_plans.moderation_reason IS 'Motivo da moderação ou payload JSON de imagens/conteúdo sinalizado';

