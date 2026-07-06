-- ============================================================================
-- Migration: Collections (Coleções da Comunidade)
-- ============================================================================
-- Coleções são listas públicas de produtos e serviços criadas por usuários.
-- Diferente de wishlist: é conteúdo compartilhável focado em recomendação.
-- ============================================================================

-- 1. TABELA COLLECTIONS
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cover_url TEXT,
  items_count INTEGER NOT NULL DEFAULT 0 CHECK (items_count >= 0),
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA COLLECTION ITEMS
CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
  item_id UUID NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, item_type, item_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_collections_author_id ON collections(author_id);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_views_count ON collections(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_order ON collection_items(collection_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_collection_items_item ON collection_items(item_type, item_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
-- Note: ENABLE ROW LEVEL SECURITY is idempotent; re-running is safe.

-- Collections: dono pode tudo; demais usuários autenticados podem ler
DROP POLICY IF EXISTS "collections_select_own_or_public" ON collections;
CREATE POLICY "collections_select_own_or_public"
  ON collections FOR SELECT
  USING (author_id = auth.uid() OR true);

DROP POLICY IF EXISTS "collections_insert_own" ON collections;
CREATE POLICY "collections_insert_own"
  ON collections FOR INSERT
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "collections_update_own" ON collections;
CREATE POLICY "collections_update_own"
  ON collections FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "collections_delete_own" ON collections;
CREATE POLICY "collections_delete_own"
  ON collections FOR DELETE
  USING (author_id = auth.uid());

-- Collection items: acesso via collection
DROP POLICY IF EXISTS "collection_items_select" ON collection_items;
CREATE POLICY "collection_items_select"
  ON collection_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id));

DROP POLICY IF EXISTS "collection_items_insert" ON collection_items;
CREATE POLICY "collection_items_insert"
  ON collection_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.author_id = auth.uid()));

DROP POLICY IF EXISTS "collection_items_update" ON collection_items;
CREATE POLICY "collection_items_update"
  ON collection_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.author_id = auth.uid()));

DROP POLICY IF EXISTS "collection_items_delete" ON collection_items;
CREATE POLICY "collection_items_delete"
  ON collection_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.author_id = auth.uid()));

-- ============================================================================
-- TRIGGER: atualiza items_count na collection
-- ============================================================================
CREATE OR REPLACE FUNCTION update_collection_items_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE collections SET items_count = items_count + 1, updated_at = now() WHERE id = NEW.collection_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE collections SET items_count = GREATEST(items_count - 1, 0), updated_at = now() WHERE id = OLD.collection_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_collection_items_count ON collection_items;
CREATE TRIGGER trg_collection_items_count
  AFTER INSERT OR DELETE ON collection_items
  FOR EACH ROW EXECUTE FUNCTION update_collection_items_count();

-- ============================================================================
-- FUNÇÃO: incrementar visualização (evita race condition)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_collection_views(p_collection_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE collections SET views_count = views_count + 1 WHERE id = p_collection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
