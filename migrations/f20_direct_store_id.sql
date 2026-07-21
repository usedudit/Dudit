-- ============================================================================
-- F20: Direct store_id on base tables
-- 
-- Adiciona store_id diretamente em products, services, product_kits, suppliers
-- com backfill a partir das bridges existentes.
-- 
-- NÃO dropa as bridges ainda — primeiro validamos os dados.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. products
-- ============================================================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- Backfill a partir de store_products
UPDATE public.products p
SET store_id = sp.store_id
FROM public.store_products sp
WHERE sp.product_id = p.id
  AND p.store_id IS NULL;

-- Fallback: produtos sem bridge → primeira loja do partner
UPDATE public.products p
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = p.partner_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE p.store_id IS NULL;

ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);

-- ============================================================================
-- 2. services
-- ============================================================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

UPDATE public.services sv
SET store_id = ss.store_id
FROM public.store_services ss
WHERE ss.service_id = sv.id
  AND sv.store_id IS NULL;

UPDATE public.services sv
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = sv.partner_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE sv.store_id IS NULL;

ALTER TABLE public.services ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_store_id ON public.services(store_id);

-- ============================================================================
-- 3. product_kits
-- ============================================================================
ALTER TABLE public.product_kits ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

UPDATE public.product_kits pk
SET store_id = spk.store_id
FROM public.store_product_kits spk
WHERE spk.kit_id = pk.id
  AND pk.store_id IS NULL;

UPDATE public.product_kits pk
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = pk.partner_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE pk.store_id IS NULL;

ALTER TABLE public.product_kits ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_kits_store_id ON public.product_kits(store_id);

-- ============================================================================
-- 4. suppliers
-- ============================================================================
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

UPDATE public.suppliers sp
SET store_id = ss.store_id
FROM public.store_suppliers ss
WHERE ss.supplier_id = sp.id
  AND sp.store_id IS NULL;

UPDATE public.suppliers sp
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = sp.partner_id
  ORDER BY s.created_at ASC
  LIMIT 1
)
WHERE sp.store_id IS NULL;

ALTER TABLE public.suppliers ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON public.suppliers(store_id);

-- ============================================================================
-- 5. Auditoria: listar registros sem store_id (deve ser zero)
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.products WHERE store_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'products sem store_id: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.services WHERE store_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'services sem store_id: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.product_kits WHERE store_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'product_kits sem store_id: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.suppliers WHERE store_id IS NULL;
  IF v_count > 0 THEN
    RAISE WARNING 'suppliers sem store_id: %', v_count;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
