-- ============================================================================
-- Migration: 20260801_fix_create_product_transaction_rpc.sql
-- Fix: create_product_transaction (from 20260728_simplify_multi_store_architecture)
--      tried to INSERT several columns that do not exist on public.products
--      (barcode, ncm, cest, weight, height, width, length, image_url, is_active).
--      These belong to product_fiscal_profiles and product_logistics, and
--      is_active is a GENERATED ALWAYS column. Recreates the RPC correctly:
--      products columns only, fiscal -> product_fiscal_profiles,
--      logistics -> product_logistics.
-- ============================================================================

BEGIN;

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
    v_has_fiscal BOOLEAN;
    v_has_logistics BOOLEAN;
BEGIN
    v_partner_id := (p_product->>'partner_id')::UUID;
    v_store_id := (p_product->>'store_id')::UUID;

    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'partner_id is required';
    END IF;

    -- Insert Product (only columns that exist on public.products)
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
        max_stock,
        sku,
        gtin,
        unit,
        condition,
        product_type,
        status,
        category_id,
        subcategory_id,
        brand_id,
        location_id,
        images,
        is_on_promotion,
        show_price_in_store,
        show_in_marketplace,
        allow_sell_without_stock,
        is_featured,
        availability_value,
        availability_unit,
        warranty,
        video_url,
        technical_specs,
        delivery_format,
        marketplace_category_id,
        tags,
        moderation_status,
        created_at,
        updated_at
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
        COALESCE((p_product->>'max_stock')::INTEGER, 0),
        p_product->>'sku',
        p_product->>'gtin',
        p_product->>'unit',
        p_product->>'condition',
        p_product->>'product_type',
        COALESCE(p_product->>'status', CASE WHEN (p_product->>'is_active')::BOOLEAN = false THEN 'inativo' ELSE 'ativo' END),
        CASE WHEN p_product->>'category_id' IS NOT NULL AND p_product->>'category_id' <> '' THEN (p_product->>'category_id')::UUID ELSE NULL END,
        CASE WHEN p_product->>'subcategory_id' IS NOT NULL AND p_product->>'subcategory_id' <> '' THEN (p_product->>'subcategory_id')::UUID ELSE NULL END,
        CASE WHEN p_product->>'brand_id' IS NOT NULL AND p_product->>'brand_id' <> '' THEN (p_product->>'brand_id')::UUID ELSE NULL END,
        CASE WHEN p_product->>'location_id' IS NOT NULL AND p_product->>'location_id' <> '' THEN (p_product->>'location_id')::UUID ELSE NULL END,
        COALESCE(p_product->'images', '[]'::jsonb),
        COALESCE((p_product->>'is_on_promotion')::BOOLEAN, false),
        COALESCE((p_product->>'show_price_in_store')::BOOLEAN, true),
        COALESCE((p_product->>'show_in_marketplace')::BOOLEAN, true),
        COALESCE((p_product->>'allow_sell_without_stock')::BOOLEAN, false),
        COALESCE((p_product->>'is_featured')::BOOLEAN, false),
        COALESCE((p_product->>'availability_value')::INTEGER, 0),
        p_product->>'availability_unit',
        p_product->>'warranty',
        p_product->>'video_url',
        COALESCE(p_product->'technical_specs', '{}'::jsonb),
        p_product->>'delivery_format',
        CASE WHEN p_product->>'marketplace_category_id' IS NOT NULL AND p_product->>'marketplace_category_id' <> '' THEN (p_product->>'marketplace_category_id')::UUID ELSE NULL END,
        (SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_product->'tags', '[]'::jsonb))::TEXT)),
        COALESCE(p_product->>'moderation_status', 'approved'),
        COALESCE((p_product->>'created_at')::TIMESTAMPTZ, NOW()),
        COALESCE((p_product->>'updated_at')::TIMESTAMPTZ, NOW())
    )
    RETURNING id INTO v_product_id;

    -- Fiscal -> product_fiscal_profiles
    v_has_fiscal := (
        p_product ? 'ncm' OR p_product ? 'cest' OR p_product ? 'origin' OR
        p_product ? 'item_type' OR p_product ? 'cfop_internal' OR p_product ? 'cfop_external' OR
        p_product ? 'csosn' OR p_product ? 'tax_percentage' OR p_product ? 'pis_cst' OR
        p_product ? 'pis_rate' OR p_product ? 'cofins_cst' OR p_product ? 'cofins_rate' OR
        p_product ? 'ipi_cst' OR p_product ? 'ipi_code' OR p_product ? 'product_situation' OR
        p_product ? 'c_benef' OR p_product ? 'inf_ad_prod' OR p_product ? 'fci_code'
    );

    IF v_has_fiscal THEN
        INSERT INTO public.product_fiscal_profiles (
            product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external,
            csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate,
            ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
        ) VALUES (
            v_product_id,
            p_product->>'ncm', p_product->>'cest', (p_product->>'origin')::INTEGER,
            p_product->>'item_type', p_product->>'cfop_internal', p_product->>'cfop_external',
            p_product->>'csosn', (p_product->>'tax_percentage')::NUMERIC,
            p_product->>'pis_cst', (p_product->>'pis_rate')::NUMERIC,
            p_product->>'cofins_cst', (p_product->>'cofins_rate')::NUMERIC,
            p_product->>'ipi_cst', p_product->>'ipi_code',
            p_product->>'product_situation', p_product->>'c_benef',
            p_product->>'inf_ad_prod', p_product->>'fci_code'
        );
    END IF;

    -- Logistics -> product_logistics
    v_has_logistics := (
        p_product ? 'weight_gross' OR p_product ? 'weight_net' OR
        p_product ? 'width' OR p_product ? 'height' OR p_product ? 'length' OR
        p_product ? 'packaging_type' OR p_product ? 'preparation_days'
    );

    IF v_has_logistics THEN
        INSERT INTO public.product_logistics (
            product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
        ) VALUES (
            v_product_id,
            (p_product->>'weight_gross')::NUMERIC,
            (p_product->>'weight_net')::NUMERIC,
            (p_product->>'width')::NUMERIC,
            (p_product->>'height')::NUMERIC,
            (p_product->>'length')::NUMERIC,
            p_product->>'packaging_type',
            (p_product->>'preparation_days')::INTEGER
        );
    END IF;

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

    SELECT to_jsonb(products.*) INTO v_result FROM public.products WHERE id = v_product_id;

    IF v_result IS NULL THEN
        v_result := jsonb_build_object('id', v_product_id, 'success', true);
    END IF;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_transaction(JSONB, JSONB, JSONB) TO authenticated, service_role;

COMMIT;
