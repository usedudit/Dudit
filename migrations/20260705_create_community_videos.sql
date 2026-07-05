-- ============================================================================
-- Migration: Community Videos (Vídeos da Comunidade)
-- ============================================================================
-- Vídeos curtos (até 60s) vinculados a um produto, serviço ou coleção.
-- Upload feito exclusivamente via ERP por owner/admin/gerente.
-- Todo vídeo entra como "pending" e passa por moderação.
-- ============================================================================

-- 1. TABELA COMMUNITY VIDEOS
CREATE TABLE IF NOT EXISTS community_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  title TEXT CHECK (char_length(title) <= 200),
  description TEXT CHECK (char_length(description) <= 1000),
  video_url TEXT NOT NULL,
  video_thumbnail TEXT NOT NULL,
  video_signed_url TEXT,
  thumbnail_signed_url TEXT,
  duration INTEGER NOT NULL CHECK (duration >= 10 AND duration <= 60),
  linked_item_type TEXT CHECK (linked_item_type IN ('product', 'service', 'collection')),
  linked_item_id UUID,
  moderation_status TEXT NOT NULL DEFAULT 'pending_moderation'
    CHECK (moderation_status IN ('pending_moderation', 'approved', 'rejected', 'flagged')),
  moderation_reason TEXT,
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  clicks_count INTEGER NOT NULL DEFAULT 0 CHECK (clicks_count >= 0),
  orders_origin_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_origin_count >= 0),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_community_videos_partner ON community_videos(partner_id);
CREATE INDEX IF NOT EXISTS idx_community_videos_status ON community_videos(moderation_status);
CREATE INDEX IF NOT EXISTS idx_community_videos_published ON community_videos(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_community_videos_created ON community_videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_videos_views ON community_videos(views_count DESC);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE community_videos ENABLE ROW LEVEL SECURITY;

-- Dono do vídeo vê próprio; público vê apenas approved
CREATE POLICY "community_videos_select_own"
  ON community_videos FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
    OR moderation_status = 'approved'
  );

-- Apenas partners com permissão podem inserir
CREATE POLICY "community_videos_insert"
  ON community_videos FOR INSERT
  WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE user_id = auth.uid()
    )
  );

-- Dono pode atualizar (ex: editar título/descrição)
CREATE POLICY "community_videos_update_own"
  ON community_videos FOR UPDATE
  USING (partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid()))
  WITH CHECK (partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid()));

-- Dono pode deletar
CREATE POLICY "community_videos_delete_own"
  ON community_videos FOR DELETE
  USING (partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid()));

-- Admin DDT vê tudo (via admin client, bypass RLS)

-- ============================================================================
-- FUNÇÕES DE MÉTRICA
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_community_video_views(p_video_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE community_videos SET views_count = views_count + 1 WHERE id = p_video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_community_video_clicks(p_video_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE community_videos SET clicks_count = clicks_count + 1 WHERE id = p_video_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNÇÃO: checar limite mensal de vídeos por partner
-- ============================================================================
CREATE OR REPLACE FUNCTION get_partner_video_monthly_count(p_partner_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM community_videos
  WHERE partner_id = p_partner_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now() + interval '1 month');
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNÇÃO: checar limite semanal de vídeos por partner
-- ============================================================================
CREATE OR REPLACE FUNCTION get_partner_video_weekly_count(p_partner_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM community_videos
  WHERE partner_id = p_partner_id
    AND created_at >= date_trunc('week', now())
    AND created_at < date_trunc('week', now() + interval '1 week');
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
