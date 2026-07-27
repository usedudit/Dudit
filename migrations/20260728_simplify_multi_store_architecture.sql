-- ============================================================================
-- Migration: 20260728_simplify_multi_store_architecture.sql
-- Goal:
-- 1. Drop bridge tables: store_products, store_services, store_product_variants,
--    promotion_stores, coupon_stores.
-- 2. Add direct store_id column to coupons, promotions, installment_groups.
-- 3. Add store_ids UUID[] column to shared cadastros for selective store inheritance:
--    product_categories, brands, storage_locations, service_categories,
--    financial_categories, finance_accounts, payment_methods,
--    transaction_contacts, unavailable_types.
-- 4. Update create_product_transaction and related RPCs to rely on products.store_id directly.
-- ============================================================================

BEGIN;

-- ─── 1. Drop Bridge Tables ───────────────────────────────────────────────────
DROP TABLE IF EXISTS public.store_products CASCADE;
DROP TABLE IF EXISTS public.store_services CASCADE;
DROP TABLE IF EXISTS public.store_product_variants CASCADE;
DROP TABLE IF EXISTS public.promotion_stores CASCADE;
DROP TABLE IF EXISTS public.coupon_stores CASCADE;

-- ─── 2. Add Direct store_id to Store-Only Modules ─────────────────────────────
-- Coupons
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_coupons_store_id ON public.coupons(store_id);

-- Promotions
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_promotions_store_id ON public.promotions(store_id);

-- Installment Groups
ALTER TABLE public.installment_groups ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_installment_groups_store_id ON public.installment_groups(store_id);

-- Delivery Fee Rules
ALTER TABLE public.delivery_fee_rules ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_delivery_fee_rules_store_id ON public.delivery_fee_rules(store_id);

-- Deliveries
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_deliveries_store_id ON public.deliveries(store_id);

-- Delivery Orders
ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_delivery_orders_store_id ON public.delivery_orders(store_id);

-- ─── 3. Add store_ids UUID[] to Shared Cadastros & Payment Methods ──────────
-- product_categories
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.product_categories.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- brands
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.brands.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- storage_locations
ALTER TABLE public.storage_locations ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.storage_locations.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- service_categories
ALTER TABLE public.service_categories ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.service_categories.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- financial_categories
ALTER TABLE public.financial_categories ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.financial_categories.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- finance_accounts
ALTER TABLE public.finance_accounts ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.finance_accounts.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- payment_methods
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.payment_methods.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- transaction_contacts
ALTER TABLE public.transaction_contacts ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.transaction_contacts.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';

-- unavailable_types
ALTER TABLE public.unavailable_types ADD COLUMN IF NOT EXISTS store_ids UUID[] DEFAULT NULL;
COMMENT ON COLUMN public.unavailable_types.store_ids IS 'NULL = herdado por todas as lojas; array = restrito a filiais especificas';


-- ─── 4. Update create_product_transaction RPC ──────────────────────────────
-- DROP old overloads to prevent parameter name mismatch error 42P13
DROP FUNCTION IF EXISTS public.create_product_transaction(JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.create_product_transaction(JSONB, JSONB);
DROP FUNCTION IF EXISTS public.create_product_transaction(JSONB);

CREATE OR REPLACE FUNCTION public.create_product_transaction(
    p_product JSONB,
    p_variants JSONB DEFAULT '[]'::jsonb,
    p_suppliers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_partner_id UUID;
    v_store_id UUID;
    v_product_id UUID;
    v_variant JSONB;
    v_supplier JSONB;
    v_result JSONB;
BEGIN
    v_partner_id := (p_product->>'partner_id')::UUID;
    v_store_id := (p_product->>'store_id')::UUID;

    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'partner_id is required';
    END IF;

    -- Insert Product
    INSERT INTO public.products (
        partner_id,
        store_id,
        name,
        description,
        price,
        promotional_price,
        cost_price,
        stock_quantity,
        min_stock,
        sku,
        barcode,
        gtin,
        ncm,
        cest,
        unit,
        weight,
        height,
        width,
        length,
        category_id,
        subcategory_id,
        brand_id,
        location_id,
        image_url,
        images,
        is_active,
        allow_sell_without_stock,
        marketplace_category_id
    ) VALUES (
        v_partner_id,
        v_store_id,
        p_product->>'name',
        p_product->>'description',
        COALESCE((p_product->>'price')::NUMERIC, 0),
        (p_product->>'promotional_price')::NUMERIC,
        (p_product->>'cost_price')::NUMERIC,
        COALESCE((p_product->>'stock_quantity')::INTEGER, 0),
        COALESCE((p_product->>'min_stock')::INTEGER, 0),
        p_product->>'sku',
        p_product->>'barcode',
        p_product->>'gtin',
        p_product->>'ncm',
        p_product->>'cest',
        COALESCE(p_product->>'unit', 'UN'),
        (p_product->>'weight')::NUMERIC,
        (p_product->>'height')::NUMERIC,
        (p_product->>'width')::NUMERIC,
        (p_product->>'length')::NUMERIC,
        (p_product->>'category_id')::UUID,
        (p_product->>'subcategory_id')::UUID,
        (p_product->>'brand_id')::UUID,
        (p_product->>'location_id')::UUID,
        p_product->>'image_url',
        COALESCE(p_product->'images', '[]'::jsonb),
        COALESCE((p_product->>'is_active')::BOOLEAN, true),
        COALESCE((p_product->>'allow_sell_without_stock')::BOOLEAN, false),
        (p_product->>'marketplace_category_id')::UUID
    )
    RETURNING id INTO v_product_id;

    -- Insert Variants if any
    IF p_variants IS NOT NULL AND jsonb_array_length(p_variants) > 0 THEN
        FOR v_variant IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
            INSERT INTO public.product_variants (
                product_id,
                partner_id,
                sku,
                name,
                price,
                promotional_price,
                stock_quantity,
                options,
                image_url,
                is_active
            ) VALUES (
                v_product_id,
                v_partner_id,
                v_variant->>'sku',
                v_variant->>'name',
                (v_variant->>'price')::NUMERIC,
                (v_variant->>'promotional_price')::NUMERIC,
                COALESCE((v_variant->>'stock_quantity')::INTEGER, 0),
                COALESCE(v_variant->'options', '{}'::jsonb),
                v_variant->>'image_url',
                COALESCE((v_variant->>'is_active')::BOOLEAN, true)
            );
        END LOOP;
    END IF;

    -- Insert Suppliers if any
    IF p_suppliers IS NOT NULL AND jsonb_array_length(p_suppliers) > 0 THEN
        FOR v_supplier IN SELECT * FROM jsonb_array_elements(p_suppliers) LOOP
            INSERT INTO public.product_suppliers (
                product_id,
                supplier_id,
                supplier_product_code,
                cost_price
            ) VALUES (
                v_product_id,
                (v_supplier->>'supplier_id')::UUID,
                v_supplier->>'supplier_product_code',
                (v_supplier->>'cost_price')::NUMERIC
            );
        END LOOP;
    END IF;

    SELECT jsonb_build_object('id', v_product_id, 'success', true) INTO v_result;
    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) TO authenticated, service_role;

COMMIT;
