-- ============================================================================
-- MIGRATION: XML Import System
 -- Tables: xml_imports, xml_import_items
-- Description: Complete XML import pipeline with idempotency, auditability
-- ============================================================================

-- 1. xml_imports - header da importação (uma por NF-e)
CREATE TABLE IF NOT EXISTS public.xml_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- Dados da NF-e
  access_key TEXT NOT NULL,
  invoice_number TEXT,
  invoice_series TEXT,
  invoice_date TIMESTAMPTZ,
  total_value NUMERIC(10,2) DEFAULT 0,

  -- Emitente (fornecedor)
  supplier_name TEXT,
  supplier_document TEXT,
  supplier_document_type TEXT, -- 'cpf' or 'cnpj'
  supplier_ie TEXT,

  -- Status da importação
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preview', 'completed', 'failed', 'reprocessing')),

  -- Metadados
  raw_xml TEXT,
  items_count INTEGER DEFAULT 0,
  imported_items INTEGER DEFAULT 0,
  skipped_items INTEGER DEFAULT 0,
  errors JSONB,
  metadata JSONB DEFAULT '{}',

  -- Auditoria
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Idempotência: mesma chave NF-e não pode ser reimportada
  CONSTRAINT uq_xml_imports_access_key UNIQUE (partner_id, access_key)
);

-- 2. xml_import_items - itens da importação
CREATE TABLE IF NOT EXISTS public.xml_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xml_import_id UUID NOT NULL REFERENCES public.xml_imports(id) ON DELETE CASCADE,

  -- Dados brutos do XML
  raw_sku TEXT,
  raw_name TEXT NOT NULL,
  raw_ean TEXT,
  raw_ncm TEXT,
  raw_cest TEXT,
  raw_unit TEXT DEFAULT 'UN',
  raw_quantity NUMERIC(10,4) DEFAULT 0,
  raw_unit_cost NUMERIC(10,4) DEFAULT 0,
  raw_total_cost NUMERIC(10,4) DEFAULT 0,
  raw_weight_gross NUMERIC(10,4),
  raw_weight_net NUMERIC(10,4),
  raw_width NUMERIC(10,4),
  raw_height NUMERIC(10,4),
  raw_length NUMERIC(10,4),
  raw_origin TEXT,
  raw_cfop TEXT,
  raw_cst TEXT,
  raw_csosn TEXT,
  raw_pis_cst TEXT,
  raw_cofins_cst TEXT,
  raw_ipi_code TEXT,

  -- Dados fiscais completos (dump JSON)
  raw_fiscal_data JSONB,
  raw_logistics_data JSONB,

  -- Status do matching
  match_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending', 'matched', 'similar', 'new', 'skipped', 'error')),

  -- Produto matchado
  matched_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  matched_product_name TEXT,
  match_method TEXT, -- 'ean', 'sku_internal', 'sku_supplier', 'ncm_gtin', 'similarity'

  -- Conflitos detectados (armazenados como JSON, sem tabela separada)
  match_confidence NUMERIC(5,4),
  conflicts JSONB, -- [{campo, valor_xml, valor_atual}]

  -- Decisões do usuário
  user_decision TEXT, -- 'keep_product', 'update_fields', 'create_product', 'ignore'
  user_decision_data JSONB, -- {update_fields: [...], keep_fields: [...]}
  user_notes TEXT,

  -- Ações de estoque/custo
  stock_action TEXT DEFAULT 'add' CHECK (stock_action IN ('add', 'weighted_average', 'ignore')),
  cost_action TEXT DEFAULT 'update' CHECK (cost_action IN ('update', 'weighted_average', 'ignore')),

  -- Resultado da importação
  stock_added NUMERIC(10,4) DEFAULT 0,
  cost_applied NUMERIC(10,4),
  created_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  stock_movement_id UUID REFERENCES public.stock_movements(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_xml_imports_partner_status
  ON public.xml_imports(partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xml_imports_access_key
  ON public.xml_imports(access_key);

CREATE INDEX IF NOT EXISTS idx_xml_import_items_import_id
  ON public.xml_import_items(xml_import_id);

CREATE INDEX IF NOT EXISTS idx_xml_import_items_status
  ON public.xml_import_items(match_status);

CREATE INDEX IF NOT EXISTS idx_xml_import_items_matched_product
  ON public.xml_import_items(matched_product_id);

CREATE INDEX IF NOT EXISTS idx_xml_import_items_raw_ean
  ON public.xml_import_items(raw_ean)
  WHERE raw_ean IS NOT NULL;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.xml_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xml_import_items ENABLE ROW LEVEL SECURITY;

-- xml_imports: team-based access
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

-- xml_import_items: through xml_imports
CREATE POLICY "xml_import_items_select_team"
  ON public.xml_import_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (SELECT 1 FROM public.partner_users WHERE partner_id = xi.partner_id AND user_id = auth.uid())
          OR
          EXISTS (SELECT 1 FROM public.partners WHERE id = xi.partner_id AND user_id = auth.uid())
        )
    )
  );

CREATE POLICY "xml_import_items_insert_team"
  ON public.xml_import_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (SELECT 1 FROM public.partner_users WHERE partner_id = xi.partner_id AND user_id = auth.uid())
          OR
          EXISTS (SELECT 1 FROM public.partners WHERE id = xi.partner_id AND user_id = auth.uid())
        )
    )
  );

CREATE POLICY "xml_import_items_update_team"
  ON public.xml_import_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (SELECT 1 FROM public.partner_users WHERE partner_id = xi.partner_id AND user_id = auth.uid())
          OR
          EXISTS (SELECT 1 FROM public.partners WHERE id = xi.partner_id AND user_id = auth.uid())
        )
    )
  );

-- ============================================================================
-- Trigger: auto update updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS update_xml_imports_updated_at ON public.xml_imports;
CREATE TRIGGER update_xml_imports_updated_at
  BEFORE UPDATE ON public.xml_imports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_xml_import_items_updated_at ON public.xml_import_items;
CREATE TRIGGER update_xml_import_items_updated_at
  BEFORE UPDATE ON public.xml_import_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
