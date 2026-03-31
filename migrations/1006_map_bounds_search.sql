-- Adiciona latitude e longitude caso não existam no seu schema legado
ALTER TABLE partners ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS longitude double precision;

-- Criação de um índice B-tree padrão para coordenadas
CREATE INDEX IF NOT EXISTS idx_partners_latitude ON partners (latitude);
CREATE INDEX IF NOT EXISTS idx_partners_longitude ON partners (longitude);
CREATE INDEX IF NOT EXISTS idx_partners_coordinates ON partners (latitude, longitude);

-- RPC Otimizada para ser chamada pelo Frontend via supabase-js
-- Realiza a busca 'Bounding Box' retornando parceiros relevantes com suporte ao RLS
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
        p.store_name,
        p.store_image_url,
        p.store_description,
        p.business_type,
        p.latitude,
        p.longitude,
        p.opening_hours,
        p.rating,
        -- Puxa o endereço principal se existir (limit 1 por partner)
        COALESCE(
           (SELECT CONCAT(a.street, ', ', a.number, ' - ', a.city) 
            FROM public.addresses a 
            WHERE a.partner_id = p.id AND a.is_default = true 
            LIMIT 1), 
           'Sem endereço cadastrado'
        ) AS address_display
    FROM public.partners p
    WHERE 
        p.is_active = true AND
        p.latitude IS NOT NULL AND
        p.longitude IS NOT NULL AND
        p.latitude >= min_lat AND p.latitude <= max_lat AND
        p.longitude >= min_lng AND p.longitude <= max_lng
    ORDER BY p.rating DESC NULLS LAST
    LIMIT max_limit;
$$;
