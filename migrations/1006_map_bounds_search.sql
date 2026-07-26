-- RPC Otimizada para busca 'Bounding Box' retornando parceiros com dados da loja
-- Nota: latitude/longitude agora vivem em stores, não em partners
CREATE OR REPLACE FUNCTION public.get_partners_in_bounds(
    min_lat double precision,
    min_lng double precision,
    max_lat double precision,
    max_lng double precision,
    max_limit integer DEFAULT 150
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
    address_display text
)
LANGUAGE sql
SECURITY INVOKER
AS $$
    SELECT 
        p.id,
        s.name AS store_name,
        s.logo_url AS store_image_url,
        s.description AS store_description,
        p.business_type,
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
        ) AS address_display
    FROM public.partners p
    JOIN public.stores s ON s.partner_id = p.id AND s.is_headquarters = true
    WHERE 
        p.is_active = true AND
        s.is_active = true AND
        s.latitude IS NOT NULL AND
        s.longitude IS NOT NULL AND
        s.latitude >= min_lat AND s.latitude <= max_lat AND
        s.longitude >= min_lng AND s.longitude <= max_lng
    ORDER BY s.rating DESC NULLS LAST
    LIMIT max_limit;
$$;
