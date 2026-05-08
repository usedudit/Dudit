BEGIN;

-- Core coordinate fields for persisted geolocation.
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Keep partner-level coordinates aligned with default address when available.
UPDATE public.partners p
SET
  latitude = a.latitude,
  longitude = a.longitude
FROM public.addresses a
WHERE a.partner_id = p.id
  AND a.is_default = true
  AND a.latitude IS NOT NULL
  AND a.longitude IS NOT NULL
  AND (p.latitude IS NULL OR p.longitude IS NULL);

-- Guardrails for valid coordinate ranges.
ALTER TABLE public.addresses
  DROP CONSTRAINT IF EXISTS addresses_latitude_range,
  DROP CONSTRAINT IF EXISTS addresses_longitude_range,
  ADD CONSTRAINT addresses_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT addresses_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_latitude_range,
  DROP CONSTRAINT IF EXISTS partners_longitude_range,
  ADD CONSTRAINT partners_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT partners_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

-- Query acceleration for map and marketplace distance workflows.
CREATE INDEX IF NOT EXISTS idx_addresses_user_default_coords
  ON public.addresses (user_id, is_default, latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_addresses_partner_default_coords
  ON public.addresses (partner_id, is_default, latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_partners_coords
  ON public.partners (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
