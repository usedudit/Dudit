-- SCRIPT: DROP OLD OVERLOADED SCRIPT
-- Resolves "Could not choose the best candidate function" by dropping the old signature
DROP FUNCTION IF EXISTS public.create_manual_stock_movement(
    p_partner_id uuid,
    p_product_id uuid,
    p_movement_type text,
    p_quantity int,
    p_reason text,
    p_notes text,
    p_created_by text,
    p_variant_id uuid
);
