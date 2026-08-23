-- ==============================================================================
-- Migration: Add free brand and location text columns to products
-- Date: 2026-08-22
-- ==============================================================================

BEGIN;

-- 1. Add brand and location text columns to public.products if not exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS location TEXT;

-- 2. Backfill existing products from brands and storage_locations tables
UPDATE public.products p
SET brand = b.name
FROM public.brands b
WHERE p.brand_id = b.id AND (p.brand IS NULL OR p.brand = '');

UPDATE public.products p
SET location = sl.name
FROM public.storage_locations sl
WHERE p.location_id = sl.id AND (p.location IS NULL OR p.location = '');

-- 3. Recreate __mvp_unsafe_create_product_transaction with brand and location text support
CREATE OR REPLACE FUNCTION public.__mvp_unsafe_create_product_transaction(
    p_product JSONB,
    p_variants JSONB DEFAULT '[]'::jsonb,
    p_suppliers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    v_partner_id := NULLIF(p_product->>'partner_id', '')::UUID;
    v_store_id := NULLIF(p_product->>'store_id', '')::UUID;

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
        max_stock,
        sku,
        gtin,
        unit,
        condition,
        product_type,
        status,
        category_id,
        subcategory_id,
        brand,
        brand_id,
        location,
        location_id,
        images,
        is_on_promotion,
        show_price_in_store,
        show_in_marketplace,
        allow_sell_without_stock,
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
        p_product->>'brand',
        CASE WHEN p_product->>'brand_id' IS NOT NULL AND p_product->>'brand_id' <> '' THEN (p_product->>'brand_id')::UUID ELSE NULL END,
        p_product->>'location',
        CASE WHEN p_product->>'location_id' IS NOT NULL AND p_product->>'location_id' <> '' THEN (p_product->>'location_id')::UUID ELSE NULL END,
        COALESCE(p_product->'images', '[]'::jsonb),
        COALESCE((p_product->>'is_on_promotion')::BOOLEAN, false),
        COALESCE((p_product->>'show_price_in_store')::BOOLEAN, true),
        COALESCE((p_product->>'show_in_marketplace')::BOOLEAN, true),
        COALESCE((p_product->>'allow_sell_without_stock')::BOOLEAN, false),
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
        p_product ? 'weight_gross' OR p_product ? 'weight_net' OR p_product ? 'width' OR
        p_product ? 'height' OR p_product ? 'length' OR p_product ? 'packaging_type' OR
        p_product ? 'preparation_days'
    );

    IF v_has_logistics THEN
        INSERT INTO public.product_logistics (
            product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
        ) VALUES (
            v_product_id,
            (p_product->>'weight_gross')::NUMERIC, (p_product->>'weight_net')::NUMERIC,
            (p_product->>'width')::NUMERIC, (p_product->>'height')::NUMERIC,
            (p_product->>'length')::NUMERIC, p_product->>'packaging_type',
            (p_product->>'preparation_days')::INTEGER
        );
    END IF;

    -- Variants -> product_variants
    IF p_variants IS NOT NULL AND jsonb_array_length(p_variants) > 0 THEN
        FOR v_variant IN SELECT * FROM jsonb_array_elements(p_variants)
        LOOP
            INSERT INTO public.product_variants (
                product_id,
                store_id,
                name,
                sku,
                price,
                promotional_price,
                cost_price,
                stock_quantity,
                min_stock,
                max_stock,
                status,
                image_url,
                variant_options,
                created_at,
                updated_at
            ) VALUES (
                v_product_id,
                v_store_id,
                v_variant->>'name',
                v_variant->>'sku',
                COALESCE((v_variant->>'price')::NUMERIC, 0),
                (v_variant->>'promotional_price')::NUMERIC,
                (v_variant->>'cost_price')::NUMERIC,
                COALESCE((v_variant->>'stock_quantity')::INTEGER, 0),
                COALESCE((v_variant->>'min_stock')::INTEGER, 0),
                COALESCE((v_variant->>'max_stock')::INTEGER, 0),
                COALESCE(v_variant->>'status', 'ativo'),
                v_variant->>'image_url',
                COALESCE(v_variant->'variant_options', '{}'::jsonb),
                COALESCE((v_variant->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((v_variant->>'updated_at')::TIMESTAMPTZ, NOW())
            );
        END LOOP;
    END IF;

    -- Suppliers -> product_suppliers
    IF p_suppliers IS NOT NULL AND jsonb_array_length(p_suppliers) > 0 THEN
        FOR v_supplier IN SELECT * FROM jsonb_array_elements(p_suppliers)
        LOOP
            INSERT INTO public.product_suppliers (
                product_id,
                supplier_id,
                supplier_sku,
                cost_price,
                lead_time_days,
                min_order_quantity,
                is_primary,
                created_at,
                updated_at
            ) VALUES (
                v_product_id,
                (v_supplier->>'supplier_id')::UUID,
                v_supplier->>'supplier_sku',
                (v_supplier->>'cost_price')::NUMERIC,
                (v_supplier->>'lead_time_days')::INTEGER,
                COALESCE((v_supplier->>'min_order_quantity')::INTEGER, 1),
                COALESCE((v_supplier->>'is_primary')::BOOLEAN, false),
                COALESCE((v_supplier->>'created_at')::TIMESTAMPTZ, NOW()),
                COALESCE((v_supplier->>'updated_at')::TIMESTAMPTZ, NOW())
            );
        END LOOP;
    END IF;

    SELECT row_to_json(products.*) INTO v_result
    FROM public.products
    WHERE id = v_product_id;

    RETURN v_result;
END;
$$;

-- 4. Recreate update_product_transaction with brand and location text support
CREATE OR REPLACE FUNCTION public.update_product_transaction(
  p_product_id UUID,
  p_product_data JSONB,
  p_fiscal_data JSONB,
  p_logistics_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products p
    LEFT JOIN partner_users pu ON p.partner_id = pu.partner_id
    LEFT JOIN partners pt ON p.partner_id = pt.id
    WHERE p.id = p_product_id AND (pu.user_id = auth.uid() OR pt.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Acesso negado: você não tem permissão para editar este produto (%)', p_product_id;
  END IF;

  IF jsonb_typeof(p_product_data) = 'object' AND p_product_data::text <> '{}' THEN
    UPDATE products SET
      name = CASE WHEN p_product_data ? 'name' THEN p_product_data->>'name' ELSE name END,
      description = CASE WHEN p_product_data ? 'description' THEN p_product_data->>'description' ELSE description END,
      sku = CASE WHEN p_product_data ? 'sku' THEN p_product_data->>'sku' ELSE sku END,
      gtin = CASE WHEN p_product_data ? 'gtin' THEN p_product_data->>'gtin' ELSE gtin END,
      brand = CASE WHEN p_product_data ? 'brand' THEN p_product_data->>'brand' ELSE brand END,
      brand_id = CASE WHEN p_product_data ? 'brand_id' THEN CASE WHEN p_product_data->>'brand_id' IS NOT NULL AND p_product_data->>'brand_id' <> '' THEN (p_product_data->>'brand_id')::UUID ELSE NULL END ELSE brand_id END,
      category_id = CASE WHEN p_product_data ? 'category_id' THEN CASE WHEN p_product_data->>'category_id' IS NOT NULL AND p_product_data->>'category_id' <> '' THEN (p_product_data->>'category_id')::UUID ELSE NULL END ELSE category_id END,
      subcategory_id = CASE WHEN p_product_data ? 'subcategory_id' THEN CASE WHEN p_product_data->>'subcategory_id' IS NOT NULL AND p_product_data->>'subcategory_id' <> '' THEN (p_product_data->>'subcategory_id')::UUID ELSE NULL END ELSE subcategory_id END,
      marketplace_category_id = CASE WHEN p_product_data ? 'marketplace_category_id' THEN CASE WHEN p_product_data->>'marketplace_category_id' IS NOT NULL AND p_product_data->>'marketplace_category_id' <> '' THEN (p_product_data->>'marketplace_category_id')::UUID ELSE NULL END ELSE marketplace_category_id END,
      condition = CASE WHEN p_product_data ? 'condition' THEN p_product_data->>'condition' ELSE condition END,
      unit = CASE WHEN p_product_data ? 'unit' THEN p_product_data->>'unit' ELSE unit END,
      product_type = CASE WHEN p_product_data ? 'product_type' THEN p_product_data->>'product_type' ELSE product_type END,
      location = CASE WHEN p_product_data ? 'location' THEN p_product_data->>'location' ELSE location END,
      location_id = CASE WHEN p_product_data ? 'location_id' THEN CASE WHEN p_product_data->>'location_id' IS NOT NULL AND p_product_data->>'location_id' <> '' THEN (p_product_data->>'location_id')::UUID ELSE NULL END ELSE location_id END,
      cost_price = CASE WHEN p_product_data ? 'cost_price' THEN (p_product_data->>'cost_price')::NUMERIC ELSE cost_price END,
      price = CASE WHEN p_product_data ? 'price' THEN (p_product_data->>'price')::NUMERIC ELSE price END,
      promotional_price = CASE WHEN p_product_data ? 'promotional_price' THEN (p_product_data->>'promotional_price')::NUMERIC ELSE promotional_price END,
      min_stock = CASE WHEN p_product_data ? 'min_stock' THEN (p_product_data->>'min_stock')::INTEGER ELSE min_stock END,
      max_stock = CASE WHEN p_product_data ? 'max_stock' THEN (p_product_data->>'max_stock')::INTEGER ELSE max_stock END,
      stock_quantity = CASE WHEN p_product_data ? 'stock_quantity' THEN (p_product_data->>'stock_quantity')::INTEGER ELSE stock_quantity END,
      status = CASE WHEN p_product_data ? 'status' THEN p_product_data->>'status' WHEN p_product_data ? 'is_active' THEN CASE WHEN (p_product_data->>'is_active')::BOOLEAN THEN 'ativo' ELSE 'inativo' END ELSE status END,
      is_on_promotion = CASE WHEN p_product_data ? 'is_on_promotion' THEN (p_product_data->>'is_on_promotion')::BOOLEAN ELSE is_on_promotion END,
      show_price_in_store = CASE WHEN p_product_data ? 'show_price_in_store' THEN (p_product_data->>'show_price_in_store')::BOOLEAN ELSE show_price_in_store END,
      show_in_marketplace = CASE WHEN p_product_data ? 'show_in_marketplace' THEN (p_product_data->>'show_in_marketplace')::BOOLEAN ELSE show_in_marketplace END,
      images = CASE WHEN p_product_data ? 'images' THEN p_product_data->'images' ELSE images END,
      availability_value = CASE WHEN p_product_data ? 'availability_value' THEN (p_product_data->>'availability_value')::INTEGER ELSE availability_value END,
      availability_unit = CASE WHEN p_product_data ? 'availability_unit' THEN p_product_data->>'availability_unit' ELSE availability_unit END,
      warranty = CASE WHEN p_product_data ? 'warranty' THEN p_product_data->>'warranty' ELSE warranty END,
      video_url = CASE WHEN p_product_data ? 'video_url' THEN p_product_data->>'video_url' ELSE video_url END,
      technical_specs = CASE WHEN p_product_data ? 'technical_specs' THEN p_product_data->'technical_specs' ELSE technical_specs END,
      delivery_format = CASE WHEN p_product_data ? 'delivery_format' THEN p_product_data->>'delivery_format' ELSE delivery_format END,
      tags = CASE WHEN p_product_data ? 'tags' THEN (SELECT ARRAY(SELECT jsonb_array_elements_text(p_product_data->'tags')::TEXT)) ELSE tags END,
      allow_sell_without_stock = CASE WHEN p_product_data ? 'allow_sell_without_stock' THEN (p_product_data->>'allow_sell_without_stock')::BOOLEAN ELSE allow_sell_without_stock END,
      updated_at = NOW()
    WHERE id = p_product_id
    RETURNING row_to_json(products.*) INTO v_result;
  END IF;

  -- Fiscal
  IF jsonb_typeof(p_fiscal_data) = 'object' AND p_fiscal_data::text <> '{}' THEN
    INSERT INTO product_fiscal_profiles (
      product_id, ncm, cest, origin, item_type, cfop_internal, cfop_external, csosn, tax_percentage, pis_cst, pis_rate, cofins_cst, cofins_rate, ipi_cst, ipi_code, product_situation, c_benef, inf_ad_prod, fci_code
    ) VALUES (
      p_product_id,
      p_fiscal_data->>'ncm', p_fiscal_data->>'cest', (p_fiscal_data->>'origin')::INTEGER,
      p_fiscal_data->>'item_type', p_fiscal_data->>'cfop_internal', p_fiscal_data->>'cfop_external',
      p_fiscal_data->>'csosn', (p_fiscal_data->>'tax_percentage')::NUMERIC,
      p_fiscal_data->>'pis_cst', (p_fiscal_data->>'pis_rate')::NUMERIC,
      p_fiscal_data->>'cofins_cst', (p_fiscal_data->>'cofins_rate')::NUMERIC,
      p_fiscal_data->>'ipi_cst', p_fiscal_data->>'ipi_code',
      p_fiscal_data->>'product_situation', p_fiscal_data->>'c_benef',
      p_fiscal_data->>'inf_ad_prod', p_fiscal_data->>'fci_code'
    ) ON CONFLICT (product_id) DO UPDATE SET
      ncm = EXCLUDED.ncm, cest = EXCLUDED.cest, origin = EXCLUDED.origin,
      item_type = EXCLUDED.item_type, cfop_internal = EXCLUDED.cfop_internal,
      cfop_external = EXCLUDED.cfop_external, csosn = EXCLUDED.csosn,
      tax_percentage = EXCLUDED.tax_percentage, pis_cst = EXCLUDED.pis_cst,
      pis_rate = EXCLUDED.pis_rate, cofins_cst = EXCLUDED.cofins_cst,
      cofins_rate = EXCLUDED.cofins_rate, ipi_cst = EXCLUDED.ipi_cst,
      ipi_code = EXCLUDED.ipi_code, product_situation = EXCLUDED.product_situation,
      c_benef = EXCLUDED.c_benef, inf_ad_prod = EXCLUDED.inf_ad_prod,
      fci_code = EXCLUDED.fci_code;
  END IF;

  -- Logistics
  IF jsonb_typeof(p_logistics_data) = 'object' AND p_logistics_data::text <> '{}' THEN
    INSERT INTO product_logistics (
      product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days
    ) VALUES (
      p_product_id,
      (p_logistics_data->>'weight_gross')::NUMERIC, (p_logistics_data->>'weight_net')::NUMERIC,
      (p_logistics_data->>'width')::NUMERIC, (p_logistics_data->>'height')::NUMERIC,
      (p_logistics_data->>'length')::NUMERIC, p_logistics_data->>'packaging_type',
      (p_logistics_data->>'preparation_days')::INTEGER
    ) ON CONFLICT (product_id) DO UPDATE SET
      weight_gross = EXCLUDED.weight_gross, weight_net = EXCLUDED.weight_net,
      width = EXCLUDED.width, height = EXCLUDED.height,
      length = EXCLUDED.length, packaging_type = EXCLUDED.packaging_type,
      preparation_days = EXCLUDED.preparation_days;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
