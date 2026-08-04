-- MIGRATION: Add store_id to xml_imports and xml_import_items
-- Description: Makes XML imports store-scoped so each store can import the same NF-e independently

-- 1. Add store_id to xml_imports
ALTER TABLE public.xml_imports
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- 2. Add store_id to xml_import_items
ALTER TABLE public.xml_import_items
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- 3. Drop old unique constraint and create new one with store_id
ALTER TABLE public.xml_imports
  DROP CONSTRAINT IF EXISTS uq_xml_imports_access_key;

ALTER TABLE public.xml_imports
  ADD CONSTRAINT uq_xml_imports_access_key UNIQUE (partner_id, store_id, access_key);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_xml_imports_store_id
  ON public.xml_imports(store_id);

CREATE INDEX IF NOT EXISTS idx_xml_imports_partner_store_status
  ON public.xml_imports(partner_id, store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xml_import_items_store_id
  ON public.xml_import_items(store_id);

-- 5. Backfill store_id for existing records (use partner's first store)
UPDATE public.xml_imports xi
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = xi.partner_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE xi.store_id IS NULL;

UPDATE public.xml_import_items xii
SET store_id = (
  SELECT xi.store_id FROM public.xml_imports xi
  WHERE xi.id = xii.xml_import_id
)
WHERE xii.store_id IS NULL;

-- 6. Update RLS policies to include store_id check
DROP POLICY IF EXISTS "xml_imports_select_team" ON public.xml_imports;
CREATE POLICY "xml_imports_select_team"
  ON public.xml_imports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "xml_imports_insert_team" ON public.xml_imports;
CREATE POLICY "xml_imports_insert_team"
  ON public.xml_imports FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "xml_imports_update_team" ON public.xml_imports;
CREATE POLICY "xml_imports_update_team"
  ON public.xml_imports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "xml_imports_delete_team" ON public.xml_imports;
CREATE POLICY "xml_imports_delete_team"
  ON public.xml_imports FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.partners
      WHERE id = xml_imports.partner_id
        AND user_id = auth.uid()
    )
  );

-- xml_import_items policies
DROP POLICY IF EXISTS "xml_import_items_select_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_select_team"
  ON public.xml_import_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_id = xi.partner_id AND user_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.partners
            WHERE id = xi.partner_id AND user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_insert_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_insert_team"
  ON public.xml_import_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_id = xi.partner_id AND user_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.partners
            WHERE id = xi.partner_id AND user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_update_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_update_team"
  ON public.xml_import_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_id = xi.partner_id AND user_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.partners
            WHERE id = xi.partner_id AND user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_delete_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_delete_team"
  ON public.xml_import_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_id = xi.partner_id AND user_id = auth.uid()
          )
          OR
          EXISTS (
            SELECT 1 FROM public.partners
            WHERE id = xi.partner_id AND user_id = auth.uid()
          )
        )
    )
  );