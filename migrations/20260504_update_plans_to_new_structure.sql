-- MIGRATION: Update plans to new structure (Começar, Crescer, Escalar)
-- Created At: 2026-05-04

-- 1. Update Existing Plans
-- We map:
-- 'free'/'gratis' -> 'free' (slug) / 'Começar' (name)
-- 'vendedor' (19.90) -> 'crescer' (slug) / 'Crescer' (name)
-- 'crescer' (49.90) -> 'escalar' (slug) / 'Escalar' (name)
-- Remove 'profissional' if exists

-- Update 'crescer' (49.90) to 'escalar' first to avoid slug conflict
UPDATE plans SET 
    name = 'Escalar',
    slug = 'escalar',
    price = 49.90,
    limits_json = '{
        "items": 999999,
        "images_per_item": 10,
        "monthly_orders": 999999,
        "monthly_appointments": 999999,
        "monthly_quotes": 999999,
        "monthly_service_orders": 999999,
        "users": 10
    }'::jsonb,
    features_json = '[
        "public_storefront",
        "customer_management",
        "appointments",
        "quotes",
        "pdv_basic",
        "whatsapp_orders",
        "whatsapp_bookings",
        "qr_code_profile",
        "service_orders",
        "product_management",
        "service_management",
        "category_management",
        "basic_inventory",
        "mercado_pago_checkout",
        "system_orders",
        "system_bookings",
        "product_variants",
        "product_complements",
        "promotions_and_coupons",
        "local_shipping_config",
        "supplier_management",
        "financial_categories",
        "xml_import",
        "basic_financial",
        "basic_reports",
        "national_shipping",
        "full_shipping_management",
        "advanced_financial",
        "cash_flow",
        "dre_report",
        "advanced_reports",
        "returns_and_exchanges",
        "product_kits",
        "subscriptions_recurring"
    ]'::jsonb,
    sort_order = 3
WHERE slug = 'crescer' OR slug = 'comerciante';

-- Update 'vendedor' (19.90) to 'crescer'
UPDATE plans SET 
    name = 'Crescer',
    slug = 'crescer',
    price = 19.90,
    limits_json = '{
        "items": 100,
        "images_per_item": 5,
        "monthly_orders": 150,
        "monthly_appointments": 150,
        "monthly_quotes": 30,
        "monthly_service_orders": 100,
        "users": 3
    }'::jsonb,
    features_json = '[
        "public_storefront",
        "customer_management",
        "appointments",
        "quotes",
        "pdv_basic",
        "whatsapp_orders",
        "whatsapp_bookings",
        "qr_code_profile",
        "service_orders",
        "product_management",
        "service_management",
        "category_management",
        "basic_inventory",
        "mercado_pago_checkout",
        "system_orders",
        "system_bookings",
        "product_variants",
        "product_complements",
        "promotions_and_coupons",
        "local_shipping_config",
        "supplier_management",
        "financial_categories",
        "xml_import",
        "basic_financial",
        "basic_reports"
    ]'::jsonb,
    sort_order = 2
WHERE slug = 'vendedor';

-- Update 'free'/'gratis'
UPDATE plans SET 
    name = 'Começar',
    price = 0,
    limits_json = '{
        "items": 15,
        "images_per_item": 2,
        "monthly_orders": 25,
        "monthly_appointments": 30,
        "monthly_quotes": 10,
        "monthly_service_orders": 15,
        "users": 1
    }'::jsonb,
    features_json = '[
        "public_storefront",
        "customer_management",
        "appointments",
        "quotes",
        "pdv_basic",
        "whatsapp_orders",
        "whatsapp_bookings",
        "qr_code_profile",
        "service_orders"
    ]'::jsonb,
    sort_order = 1
WHERE slug = 'free' OR slug = 'gratis';

DELETE FROM plans WHERE slug = 'profissional' OR price = 79.90;

-- 2. Update Usage Counters Table
-- Add column for service orders if not exists
ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS service_orders_month_count INTEGER DEFAULT 0;

-- 3. Update RPC Functions
DROP FUNCTION IF EXISTS increment_usage_counter(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS decrement_usage_counter(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION increment_usage_counter(p_partner_id UUID, p_column_name TEXT, p_amount INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('INSERT INTO usage_counters (partner_id, %I) 
                    VALUES ($1, $2) 
                    ON CONFLICT (partner_id) 
                    DO UPDATE SET %I = usage_counters.%I + $2', p_column_name, p_column_name, p_column_name)
    USING p_partner_id, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_usage_counter(p_partner_id UUID, p_column_name TEXT, p_amount INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
    EXECUTE format('UPDATE usage_counters SET %I = GREATEST(0, %I - $2) WHERE partner_id = $1', p_column_name, p_column_name)
    USING p_partner_id, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reset_monthly_counters()
RETURNS VOID AS $$
BEGIN
    UPDATE usage_counters SET 
        orders_month_count = 0,
        appointments_month_count = 0,
        quotes_month_count = 0,
        service_orders_month_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
