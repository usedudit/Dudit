-- ============================================================================
-- Fase 10.1 - Store-Aware Product Variants
-- ============================================================================
-- Cria store_product_variants: vincula uma variante (product_variants) a uma
-- store específica, permitindo que uma mesma variante tenha estoque diferente
-- por loja sem duplicar o registro base.
--
-- Fluxo de resolução (lib/store-variants.ts):
--   1. Busca a variante base em product_variants
--   2. Busca o store_product_variants para (variant_id, store_id)
--   3. Se existir: COALESCE(override_*, base_*) para stock/SKU/price
--   4. Se não existir: usa a variante base (backward compatibility)
--
-- Overrides postergados para fases futuras:
--   - override_price_adjustment
--   - override_sku
--   - override_barcode
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Criar tabela store_product_variants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.store_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  override_stock_quantity INTEGER,
  is_active BOOLEAN DEFAULT true,
  stock_reserved INTEGER NOT NULL DEFAULT 0,
  stock_available INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(variant_id, store_id)
);

-- ============================================================
-- 2. Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_spv_variant_id ON public.store_product_variants(variant_id);
CREATE INDEX IF NOT EXISTS idx_spv_store_id ON public.store_product_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_spv_partner_id ON public.store_product_variants(partner_id);
CREATE INDEX IF NOT EXISTS idx_spv_variant_store ON public.store_product_variants(variant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_spv_store_active ON public.store_product_variants(store_id, is_active) WHERE is_active = true;

-- ============================================================
-- 3. Trigger: sync_spv_stock_availability
--    Mantém stock_available = MAX(0, COALESCE(override_stock, base_stock) - reserved)
--    NOTA: o trigger não pode JOIN product_variants (BEFORE trigger),
--    então stock_available é mantido via COALESCE do próprio override.
--    O COALESCE com product_variants.stock_quantity é feito no resolver.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_spv_stock_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.stock_reserved := COALESCE(NEW.stock_reserved, 0);
  NEW.stock_available := GREATEST(0, COALESCE(NEW.override_stock_quantity, 0) - NEW.stock_reserved);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_spv_stock_availability ON public.store_product_variants;
CREATE TRIGGER sync_spv_stock_availability
  BEFORE INSERT OR UPDATE OF override_stock_quantity, stock_reserved
  ON public.store_product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_spv_stock_availability();

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.store_product_variants ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário com acesso à store pode ver vínculos de variantes
DROP POLICY IF EXISTS spv_select ON public.store_product_variants;
CREATE POLICY spv_select ON public.store_product_variants
  FOR SELECT USING (
    public.user_has_store_access(store_id)
  );

-- INSERT: owner/admin/manager podem vincular variantes
DROP POLICY IF EXISTS spv_insert ON public.store_product_variants;
CREATE POLICY spv_insert ON public.store_product_variants
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin', 'manager')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE: owner/admin/manager podem alterar overrides
DROP POLICY IF EXISTS spv_update ON public.store_product_variants;
CREATE POLICY spv_update ON public.store_product_variants
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin', 'manager')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- DELETE: owner/admin podem remover vínculos
DROP POLICY IF EXISTS spv_delete ON public.store_product_variants;
CREATE POLICY spv_delete ON public.store_product_variants
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE partner_id IN (
        SELECT partner_id FROM partner_users WHERE user_id = auth.uid() AND role_id IN ('owner', 'admin')
        UNION
        SELECT id FROM partners WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 5. Backfill: para cada (variante, loja do mesmo partner),
--    criar store_product_variants com override NULL (herda da base).
--    Idempotente via ON CONFLICT DO NOTHING.
-- ============================================================
INSERT INTO public.store_product_variants (variant_id, store_id, partner_id, is_active)
SELECT
  pv.id,
  s.id,
  p.partner_id,
  COALESCE(pv.is_active, true)
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
CROSS JOIN public.stores s
WHERE s.partner_id = p.partner_id
  AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.store_product_variants spv
    WHERE spv.variant_id = pv.id AND spv.store_id = s.id
  );

COMMIT;
