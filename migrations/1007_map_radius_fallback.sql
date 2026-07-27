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
        s.name AS store_name,
        s.logo_url AS store_image_url,
        s.description AS store_description,
        s.business_type,
        s.latitude,
        s.longitude,
        s.opening_hours,
        s.rating,
        COALESCE(
           (SELECT CONCAT(a.street, ', ', a.number, ' - ', a.city) 
            FROM public.addresses a 
            WHERE a.store_id = s.id AND a.is_default = true 
            LIMIT 1), 
           'Sem endereço cadastrado'
        ) AS address_display,
        (6371 * acos(
            cos(radians(center_lat)) 
            * cos(radians(s.latitude)) 
            * cos(radians(s.longitude) - radians(center_lng)) 
            + sin(radians(center_lat)) * sin(radians(s.latitude))
        )) AS distance_km
    FROM public.partners p
    JOIN public.stores s ON s.partner_id = p.id AND s.is_headquarters = true
    WHERE 
        p.is_active = true AND
        s.is_active = true AND
        s.latitude IS NOT NULL AND
        s.longitude IS NOT NULL AND
        (6371 * acos(
            cos(radians(center_lat)) 
            * cos(radians(s.latitude)) 
            * cos(radians(s.longitude) - radians(center_lng)) 
            + sin(radians(center_lat)) * sin(radians(s.latitude))
        )) <= radius_km
    ORDER BY distance_km ASC
    LIMIT max_limit;
$$;
