-- Função de fallback usando a fórmula de Haversine para busca por raio (Radius Search)
CREATE OR REPLACE FUNCTION public.get_partners_in_radius(
    center_lat double precision,
    center_lng double precision,
    radius_km double precision DEFAULT 20.0,
    max_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    store_name text,
    store_image_url text,
    store_description text,
    business_type text,
    latitude double precision,
    longitude double precision,
    opening_hours jsonb,
    rating double precision,
    address_display text,
    distance_km double precision
)
LANGUAGE sql
SECURITY INVOKER
AS $$
    SELECT 
        p.id,
        p.store_name,
        p.store_image_url,
        p.store_description,
        p.business_type,
        p.latitude,
        p.longitude,
        p.opening_hours,
        p.rating,
        COALESCE(
           (SELECT CONCAT(a.street, ', ', a.number, ' - ', a.city) 
            FROM public.addresses a 
            WHERE a.partner_id = p.id AND a.is_default = true 
            LIMIT 1), 
           'Sem endereço cadastrado'
        ) AS address_display,
        -- Haversine formula
        (6371 * acos(
            cos(radians(center_lat)) 
            * cos(radians(p.latitude)) 
            * cos(radians(p.longitude) - radians(center_lng)) 
            + sin(radians(center_lat)) * sin(radians(p.latitude))
        )) AS distance_km
    FROM public.partners p
    WHERE 
        p.is_active = true AND
        p.latitude IS NOT NULL AND
        p.longitude IS NOT NULL AND
        (6371 * acos(
            cos(radians(center_lat)) 
            * cos(radians(p.latitude)) 
            * cos(radians(p.longitude) - radians(center_lng)) 
            + sin(radians(center_lat)) * sin(radians(p.latitude))
        )) <= radius_km
    ORDER BY distance_km ASC
    LIMIT max_limit;
$$;
