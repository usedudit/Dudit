-- ============================================================================
-- LOCAL SPONSORED ADVERTISEMENTS
-- Platform-managed ads with geo targeting (no bidding / no external deps)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.advertisements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    destination_url TEXT NOT NULL,

    advertiser_name TEXT NOT NULL,
    advertiser_logo TEXT,

    target_mode TEXT NOT NULL CHECK (target_mode IN ('radius', 'cities', 'state', 'country')),

    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION,

    cities TEXT[] DEFAULT '{}',
    state TEXT,
    country TEXT DEFAULT 'BR',

    priority INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'expired')),

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,

    impressions_count BIGINT NOT NULL DEFAULT 0,
    clicks_count BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT advertisements_date_range CHECK (ends_at > starts_at),
    CONSTRAINT advertisements_radius_target CHECK (
        target_mode <> 'radius'
        OR (center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_km IS NOT NULL AND radius_km > 0)
    ),
    CONSTRAINT advertisements_cities_target CHECK (
        target_mode <> 'cities' OR (cities IS NOT NULL AND cardinality(cities) > 0)
    ),
    CONSTRAINT advertisements_state_target CHECK (
        target_mode <> 'state' OR (state IS NOT NULL AND length(trim(state)) > 0)
    ),
    CONSTRAINT advertisements_country_target CHECK (
        target_mode <> 'country' OR (country IS NOT NULL AND length(trim(country)) > 0)
    )
);

COMMENT ON TABLE public.advertisements IS 'Platform-sponsored local business advertisements. Managed via admin panel only.';

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_advertisements_status ON public.advertisements (status);
CREATE INDEX IF NOT EXISTS idx_advertisements_starts_at ON public.advertisements (starts_at);
CREATE INDEX IF NOT EXISTS idx_advertisements_ends_at ON public.advertisements (ends_at);
CREATE INDEX IF NOT EXISTS idx_advertisements_priority ON public.advertisements (priority DESC);

CREATE INDEX IF NOT EXISTS idx_advertisements_active_schedule
    ON public.advertisements (starts_at, ends_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_advertisements_target_mode
    ON public.advertisements (target_mode)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_advertisements_cities_gin
    ON public.advertisements USING GIN (cities)
    WHERE status = 'active' AND target_mode = 'cities';

CREATE INDEX IF NOT EXISTS idx_advertisements_state
    ON public.advertisements (state)
    WHERE status = 'active' AND target_mode = 'state';

CREATE INDEX IF NOT EXISTS idx_advertisements_country
    ON public.advertisements (country)
    WHERE status = 'active' AND target_mode = 'country';

CREATE INDEX IF NOT EXISTS idx_advertisements_radius_coords
    ON public.advertisements (center_lat, center_lng)
    WHERE status = 'active' AND target_mode = 'radius';

-- ─── RLS: admin/service-role only ───────────────────────────────────────────

ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated - all access via service-role server actions.

-- ─── Analytics RPCs (atomic increments) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_ad_impression(ad_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.advertisements
    SET impressions_count = impressions_count + 1,
        updated_at = now()
    WHERE id = ad_id
      AND status = 'active'
      AND starts_at <= now()
      AND ends_at >= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ad_click(ad_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.advertisements
    SET clicks_count = clicks_count + 1,
        updated_at = now()
    WHERE id = ad_id
      AND status = 'active'
      AND starts_at <= now()
      AND ends_at >= now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_ad_impression(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ad_click(UUID) FROM PUBLIC;

-- Extend audit log target types for advertising actions
ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_type_check;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_target_type_check
    CHECK (target_type IN (
        'user', 'partner', 'product', 'service', 'subscription',
        'system', 'review', 'return_request', 'advertisement'
    ));
